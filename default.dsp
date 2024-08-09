import("stdfaust.lib");

N = 8;

oscillator(index, frequency, detune) = os.sawtooth(frequency + index*detune);
drone(oscillator_count, frequency, detune) = par(i, oscillator_count, oscillator(i, frequency, detune));

frequency = hslider("frequency", 110, 20, 20000, 1);
detune = hslider("detune", 0, -10, 10, 0.01);

process = drone(N, frequency, detune) :> /(N);
