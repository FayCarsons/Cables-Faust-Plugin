# Faust Cables plugin

This is the code for a [Cables.gl](cables.gl) operator that enables users to live-code
[Faust](https://faust.grame.fr/) programs in their Cables patches.

It is currently a work in progress, with a final release planned at the end of 
[Google Summer of Code](https://summerofcode.withgoogle.com/programs/2024) 2024.

# Usage

If you'd like to build your own Cables operator from this code, first create a tree-shaken version of the 
[faustwasm](https://github.com/grame-cncm/faustwasm/tree/master) library by running `npm run build`.
Then place the contents of `main.js` in a custom Cables operator, and the contents 
of `porthandler.js` and `dist/index.js` into Cables attachments named 
`porthandler` and `faustwasm` respectively.

From there, you may write Faust programs in the operator's string editor, and 
input/output ports for each Faust parameter will be generated. Faust button and checkbox 
params correspond to Cables' trigger ports, audio to object ports, everything 
else to number ports. The port's names will mirror your Faust params, simply 
attach other Cables operators to control them.

# Soundfiles

Faust's stdlib includes a `soundfile` primitive which can be used to load audio files. Documentation can be found [here](https://faustdoc.grame.fr/manual/soundfiles/). In the case of this Cables operator, a soundfile will be fetched when the Faust script is compiled. There is one caveat:
soundfile paths must be written explicitly in whole.

This:
```dsp
declare soundfiles "https://foo.com/bar";

file = soundfile("baz.wav", 1);
```

will break your Faust script. Instead the file should be included like this:

```dsp
url = "https://foo.com/bar/baz.wav;"
file = soundfile(url, 2);
```

or the url inlined in the call to `soundfile`.

# Polyphony

Polyphonic mode uses MIDI by default, and expects a frequency(`freq` or `key`) and gate(`gate`) parameter to be present in your script:

- `freq`: frequency in Hz
- `key`: MIDI key number (0 - 127)
- `gate`: note-on trigger
- `gain`: *optional* velocity normalized to 0-1
- `velocity` or `vel`: *optional* MIDI velocity (0 - 127)

For more information see [the Faust MIDI documentation](https://faustdoc.grame.fr/manual/midi/)
