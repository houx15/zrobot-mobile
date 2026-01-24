package com.anonymous.learninglampmobile

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.concurrent.Executors

class PCMPlayerModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var audioTrack: AudioTrack? = null
    private val executor = Executors.newSingleThreadExecutor()

    override fun getName(): String = "PCMPlayer"

    @ReactMethod
    fun init(sampleRate: Int, channels: Int, bitsPerSample: Int, promise: Promise) {
        try {
            release()
            val channelConfig = if (channels == 1) {
                AudioFormat.CHANNEL_OUT_MONO
            } else {
                AudioFormat.CHANNEL_OUT_STEREO
            }
            val encoding = if (bitsPerSample == 8) {
                AudioFormat.ENCODING_PCM_8BIT
            } else {
                AudioFormat.ENCODING_PCM_16BIT
            }
            val minBufferSize = AudioTrack.getMinBufferSize(sampleRate, channelConfig, encoding)
            if (minBufferSize == AudioTrack.ERROR || minBufferSize == AudioTrack.ERROR_BAD_VALUE) {
                promise.reject("PCM_INIT_FAILED", "Invalid AudioTrack buffer size")
                return
            }

            val audioAttributes = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build()

            val audioFormat = AudioFormat.Builder()
                .setSampleRate(sampleRate)
                .setEncoding(encoding)
                .setChannelMask(channelConfig)
                .build()

            audioTrack = AudioTrack.Builder()
                .setAudioAttributes(audioAttributes)
                .setAudioFormat(audioFormat)
                .setTransferMode(AudioTrack.MODE_STREAM)
                .setBufferSizeInBytes(minBufferSize * 2)
                .build()

            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("PCM_INIT_FAILED", e.message)
        }
    }

    @ReactMethod
    fun start() {
        audioTrack?.play()
    }

    @ReactMethod
    fun write(base64Data: String) {
        val track = audioTrack ?: return
        executor.execute {
            try {
                val bytes = Base64.decode(base64Data, Base64.DEFAULT)
                track.write(bytes, 0, bytes.size)
            } catch (_: Exception) {
                // Ignore decode/write failures
            }
        }
    }

    @ReactMethod
    fun stop() {
        release()
    }

    private fun release() {
        try {
            audioTrack?.stop()
        } catch (_: Exception) {
        }
        try {
            audioTrack?.flush()
        } catch (_: Exception) {
        }
        try {
            audioTrack?.release()
        } catch (_: Exception) {
        }
        audioTrack = null
    }

    override fun invalidate() {
        super.invalidate()
        release()
        executor.shutdown()
    }
}
