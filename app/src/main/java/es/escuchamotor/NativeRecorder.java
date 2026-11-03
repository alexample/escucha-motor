package es.escuchamotor;

import android.annotation.SuppressLint;
import android.content.Context;
import android.media.AudioDeviceInfo;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.media.audiofx.AcousticEchoCanceler;
import android.media.audiofx.AutomaticGainControl;
import android.media.audiofx.NoiseSuppressor;
import android.os.Build;
import android.util.Base64;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;

/**
 * Grabación directa del micrófono integrado, sin el procesado de voz
 * (supresión de ruido, control de volumen, cancelación de eco) que el
 * sistema aplica a las llamadas y al micrófono del navegador.
 */
public class NativeRecorder {
    private final Context ctx;
    private AudioRecord rec;
    private Thread thread;
    private volatile boolean running;
    private final ByteArrayOutputStream buf = new ByteArrayOutputStream();
    private volatile double lastRms = 0, lastPeak = 0;
    private volatile boolean clipped = false;
    private int sampleRate = 48000;
    private String sourceName = "";
    private String info = "";
    private NoiseSuppressor ns;
    private AutomaticGainControl agc;
    private AcousticEchoCanceler aec;

    public NativeRecorder(Context ctx) {
        this.ctx = ctx;
    }

    @SuppressLint("MissingPermission")
    public synchronized String start() {
        JSONObject out = new JSONObject();
        try {
            stopInternal();
            AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
            int source = MediaRecorder.AudioSource.VOICE_RECOGNITION;
            sourceName = "VOICE_RECOGNITION";
            if (Build.VERSION.SDK_INT >= 24 && am != null
                    && "true".equals(am.getProperty(AudioManager.PROPERTY_SUPPORT_AUDIO_SOURCE_UNPROCESSED))) {
                source = MediaRecorder.AudioSource.UNPROCESSED;
                sourceName = "UNPROCESSED";
            }
            int[] rates = {48000, 44100};
            AudioRecord r = null;
            for (int sr : rates) {
                int min = AudioRecord.getMinBufferSize(sr, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
                if (min <= 0) continue;
                AudioRecord cand = new AudioRecord(source, sr, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, Math.max(min * 4, sr));
                if (cand.getState() == AudioRecord.STATE_INITIALIZED) {
                    r = cand;
                    sampleRate = sr;
                    break;
                }
                cand.release();
            }
            if (r == null) throw new IllegalStateException("No se pudo abrir el micrófono");

            // micrófono integrado (no Bluetooth ni auriculares)
            StringBuilder notes = new StringBuilder();
            if (am != null) {
                for (AudioDeviceInfo d : am.getDevices(AudioManager.GET_DEVICES_INPUTS)) {
                    if (d.getType() == AudioDeviceInfo.TYPE_BUILTIN_MIC) {
                        r.setPreferredDevice(d);
                        break;
                    }
                }
            }
            int sid = r.getAudioSessionId();
            if (NoiseSuppressor.isAvailable()) {
                ns = NoiseSuppressor.create(sid);
                if (ns != null) { ns.setEnabled(false); notes.append("NS off;"); }
            }
            if (AutomaticGainControl.isAvailable()) {
                agc = AutomaticGainControl.create(sid);
                if (agc != null) { agc.setEnabled(false); notes.append("AGC off;"); }
            }
            if (AcousticEchoCanceler.isAvailable()) {
                aec = AcousticEchoCanceler.create(sid);
                if (aec != null) { aec.setEnabled(false); notes.append("AEC off;"); }
            }
            info = notes.toString();
            rec = r;
            synchronized (buf) { buf.reset(); }
            clipped = false;
            running = true;
            rec.startRecording();
            final AudioRecord fr = rec;
            thread = new Thread(() -> {
                short[] s = new short[2048];
                byte[] b = new byte[4096];
                while (running) {
                    int n = fr.read(s, 0, s.length);
                    if (n <= 0) continue;
                    double sum = 0, pk = 0;
                    for (int i = 0; i < n; i++) {
                        double v = s[i] / 32768.0;
                        sum += v * v;
                        double a = Math.abs(v);
                        if (a > pk) pk = a;
                        b[2 * i] = (byte) (s[i] & 0xff);
                        b[2 * i + 1] = (byte) ((s[i] >> 8) & 0xff);
                    }
                    lastRms = Math.sqrt(sum / n);
                    lastPeak = pk;
                    synchronized (buf) {
                        buf.write(b, 0, 2 * n);
                        if (pk >= 0.99) clipped = true;
                    }
                }
            }, "grabacion");
            thread.start();
            out.put("ok", true);
            out.put("sampleRate", sampleRate);
            out.put("source", sourceName);
            out.put("info", info);
        } catch (Exception e) {
            try {
                out.put("ok", false);
                out.put("error", String.valueOf(e.getMessage()));
            } catch (Exception ignored) {
            }
            stopInternal();
        }
        return out.toString();
    }

    /** Descarta lo grabado hasta ahora (fin de la cuenta atrás). */
    public void reset() {
        synchronized (buf) {
            buf.reset();
            clipped = false;
        }
    }

    public String level() {
        try {
            JSONObject o = new JSONObject();
            o.put("rms", lastRms);
            o.put("peak", lastPeak);
            o.put("clip", clipped);
            synchronized (buf) { o.put("seconds", buf.size() / 2.0 / sampleRate); }
            return o.toString();
        } catch (Exception e) {
            return "{}";
        }
    }

    /** Detiene y devuelve el PCM 16 bits mono en base64. */
    public synchronized String stop() {
        stopInternal();
        byte[] data;
        synchronized (buf) {
            data = buf.toByteArray();
            buf.reset();
        }
        try {
            JSONObject o = new JSONObject();
            o.put("sampleRate", sampleRate);
            o.put("source", sourceName);
            o.put("info", info);
            o.put("pcm", Base64.encodeToString(data, Base64.NO_WRAP));
            return o.toString();
        } catch (Exception e) {
            return "{}";
        }
    }

    public synchronized void cancel() {
        stopInternal();
        synchronized (buf) { buf.reset(); }
    }

    private void stopInternal() {
        running = false;
        if (thread != null) {
            try { thread.join(500); } catch (InterruptedException ignored) { }
            thread = null;
        }
        if (ns != null) { ns.release(); ns = null; }
        if (agc != null) { agc.release(); agc = null; }
        if (aec != null) { aec.release(); aec = null; }
        if (rec != null) {
            try { rec.stop(); } catch (Exception ignored) { }
            rec.release();
            rec = null;
        }
    }
}
