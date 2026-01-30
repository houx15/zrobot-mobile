package com.anonymous.learninglampmobile

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.NoiseSuppressor
import android.util.Base64
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter
import java.util.concurrent.atomic.AtomicBoolean

class PCMRecorderModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var audioRecord: AudioRecord? = null
    private var recorderThread: Thread? = null
    private val isRecording = AtomicBoolean(false)
    private var aec: AcousticEchoCanceler? = null
    private var ns: NoiseSuppressor? = null
    private var debugEnabled: Boolean = false
    private var debugFrameCounter: Int = 0
    private val debugFrameInterval: Int = 20
    private var gain: Float = 1.0f
    private var initSeq: Int = 0

    override fun getName(): String = "PCMRecorder"

    @ReactMethod
    fun init(
        sampleRate: Int,
        channels: Int,
        bitsPerSample: Int,
        audioSource: Int,
        enableAec: Boolean,
        enableNs: Boolean,
        gain: Double,
        promise: Promise
    ) {
        try {
            initSeq += 1
            Log.w(
                "PCMRecorder",
                "init#$initSeq sr=$sampleRate ch=$channels bits=$bitsPerSample source=$audioSource aec=$enableAec ns=$enableNs gain=$gain"
            )
            if (isRecording.get()) {
                promise.reject("REC_BUSY", "Recorder is recording; stop before init")
                return
            }
            stopInternal(true)
            debugFrameCounter = 0
            this.gain = gain.toFloat()

            val channelConfig = if (channels == 1) {
                AudioFormat.CHANNEL_IN_MONO
            } else {
                AudioFormat.CHANNEL_IN_STEREO
            }
            val encoding = if (bitsPerSample == 8) {
                AudioFormat.ENCODING_PCM_8BIT
            } else {
                AudioFormat.ENCODING_PCM_16BIT
            }

            val minBufferSize = AudioRecord.getMinBufferSize(sampleRate, channelConfig, encoding)
            if (minBufferSize == AudioRecord.ERROR || minBufferSize == AudioRecord.ERROR_BAD_VALUE) {
                promise.reject("REC_INIT_FAILED", "Invalid AudioRecord buffer size")
                return
            }

            audioRecord = AudioRecord(
                audioSource,
                sampleRate,
                channelConfig,
                encoding,
                minBufferSize * 2
            )
            if (audioRecord?.state != AudioRecord.STATE_INITIALIZED) {
                stopInternal(true)
                promise.reject("REC_INIT_FAILED", "AudioRecord not initialized")
                return
            }
            if (debugEnabled) {
                Log.w("PCMRecorder", "init ok sr=$sampleRate ch=$channels bits=$bitsPerSample buf=${minBufferSize * 2}")
            }

            val sessionId = audioRecord?.audioSessionId ?: 0
            if (enableAec && AcousticEchoCanceler.isAvailable() && sessionId != 0) {
                Log.w("PCMRecorderAEC", "AEC Enabled, sessionId=$sessionId")
                aec = AcousticEchoCanceler.create(sessionId)
                aec?.enabled = true
            } else {
                Log.w("PCMRecorderAEC", "AEC Disabled, sessionId=$sessionId, enableAec=$enableAec")
            }
            if (enableNs && NoiseSuppressor.isAvailable() && sessionId != 0) {
                ns = NoiseSuppressor.create(sessionId)
                ns?.enabled = true
            }

            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("REC_INIT_FAILED", e.message)
        }
    }

    @ReactMethod
    fun start(promise: Promise) {
        val recorder = audioRecord
        if (recorder == null) {
            promise.reject("REC_NOT_INIT", "Recorder not initialized")
            return
        }
        if (isRecording.get()) {
            promise.resolve(true)
            return
        }

        try {
            recorder.startRecording()
        } catch (e: Exception) {
            promise.reject("REC_START_FAILED", e.message)
            return
        }

        isRecording.set(true)
        val byteBuffer = ByteArray(2048)
        recorderThread = Thread {
            while (isRecording.get()) {
                val read = recorder.read(byteBuffer, 0, byteBuffer.size)
                if (read > 0) {
                    val readBytes = read - (read % 2)
                    val b64 = Base64.encodeToString(byteBuffer, 0, readBytes, Base64.NO_WRAP)
                    emitData(b64)
                    if (debugEnabled) {
                        debugFrameCounter++
                        if (debugFrameCounter % debugFrameInterval == 0) {
                            val metrics = computePeakRmsBytes(byteBuffer, readBytes)
                            Log.w("PCMRecorder", "read=$readBytes peak=${metrics.first} rms=${metrics.second}")
                        }
                    }
                } else if (debugEnabled) {
                    Log.w("PCMRecorder", "read error=$read state=${recorder.state} recState=${recorder.recordingState}")
                }
            }
        }
        recorderThread?.start()
        promise.resolve(true)
    }

    @ReactMethod
    fun stop(promise: Promise) {
        stopInternal(false)
        promise.resolve(true)
    }

    @ReactMethod
    fun release(promise: Promise) {
        stopInternal(true)
        promise.resolve(true)
    }

    @ReactMethod
    fun setDebug(enabled: Boolean) {
        debugEnabled = enabled
    }

    private fun stopInternal(release: Boolean) {
        isRecording.set(false)
        try {
            recorderThread?.join(200)
        } catch (_: Exception) {
        }
        recorderThread = null
        try {
            audioRecord?.stop()
        } catch (_: Exception) {
        }
        if (release) {
            try {
                audioRecord?.release()
            } catch (_: Exception) {
            }
            audioRecord = null
            aec?.release()
            aec = null
            ns?.release()
            ns = null
        }
    }

    private fun emitData(base64: String) {
        val emitter = reactContext.getJSModule(RCTDeviceEventEmitter::class.java)
        emitter.emit("PCMRecorderData", base64)
    }

    private fun computePeakRmsBytes(data: ByteArray, size: Int): Pair<Int, Int> {
        if (size <= 1) {
            return Pair(0, 0)
        }
        var peak = 0
        var sum = 0.0
        var i = 0
        while (i + 1 < size) {
            val lo = data[i].toInt() and 0xFF
            val hi = data[i + 1].toInt()
            val sample = (hi shl 8) or lo
            val signed = sample.toShort().toInt()
            val absSample = kotlin.math.abs(signed)
            if (absSample > peak) {
                peak = absSample
            }
            sum += signed.toDouble() * signed.toDouble()
            i += 2
        }
        val frames = size / 2
        val rms = if (frames > 0) kotlin.math.sqrt(sum / frames.toDouble()) else 0.0
        return Pair(peak, rms.toInt())
    }

    override fun invalidate() {
        super.invalidate()
        stopInternal(true)
    }
}
