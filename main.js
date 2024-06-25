
"esversion: 9";

console.clear();

// Time to wait to compile after a keystroke
const DEBOUNCE_TIME = 333;
const DEFAULT_SCRIPT = `import("stdfaust.lib");

// Simple filter ping synth with trigger and frequency
freq = hslider("freq", 440, 10, 10000, 1);
gate = button("gate");

process = gate : ba.impulsify : fi.resonbp(freq, 100, 1.1) : ma.tanh;`;

// Hacky way to get sum-type-esque behavior out of JS
const Voicing = {
  Mono: "Monophonic",
  Poly: "Polyphonic"
};

const outTrigger = op.outTrigger("Loaded");
const faustEditor = op.inStringEditor("Faust Code", DEFAULT_SCRIPT);

op.setPortGroup("Faust script", [faustEditor]);
const voicing = op.inSwitch("Mode", [Voicing.Mono, Voicing.Poly], Voicing.Mono);
const voices = op.inInt("Voices");
const note = op.inInt("Note");
const gate = op.inTrigger("Gate");
const audioOut = op.outObject("Audio out");

let faustModule;
let node;
const params = [];

const ctx = CABLES.WEBAUDIO.createAudioContext(op);

function MIDItoFreq(midiNote) {
  return 440 * Math.pow(2, ((midiNote - 69) / 12));
}

gate.onTriggered = () => {
  if (!node) {
    console.log("node is NULL");
    return;
  }

  try {
    const n = note.get();
    const freq = MIDItoFreq(n + 32);

    if (node.mode === Voicing.Mono) {
      node.setParamValue("/dsp/freq", freq);
      node.setParamValue("/dsp/gate", 1);
      setTimeout(() => { return node.setParamValue("/dsp/Ping", 0); }, 10);
    } else if (node.mode === Voicing.Poly) {
      node.keyOn(0, n, 127)
      setTimeout(() => node.keyOff(0, n, 127), 10)
    }

  }
  catch (err) {
    op.setUiError("FaustError", `Error updating node: ${err}`);
  }
};


voicing.onChange = async () => {
  const voicingVal = voicing.get();

  if (node && voicingVal === node.mode) return;
  else {
    if (!!node) node.disconnect();
    node = undefined;
    await compile()
  }
};

voices.onChange = async () => {
  const numVoices = voices.get()

  if (node && numVoices === node.voices || numVoices < 1) return;
  else {
    if (!!node) node.disconnect();
    await compile()
  }

}

async function compile() {
  if (faustModule == undefined) {
    console.error("FaustModule is undefined!");
    return;
  }

  const {
    FaustMonoDspGenerator,
    FaustPolyDspGenerator,
    compiler,
  } = faustModule;

  const code = faustEditor.get();

  const voicingVal = voicing.get();

  try {
    // Avoiding using uninitialized variables
    let generator = {
      [Voicing.Mono]: () => { return new FaustMonoDspGenerator(); },
      [Voicing.Poly]: () => { return new FaustPolyDspGenerator(); }
    }[voicingVal]();
    await generator.compile(compiler, "dsp", code, "");

    if (!!node) node.disconnect();
    node = await generator.createNode(ctx, voices.get());
    node.mode = voicingVal;
    console.log("Params: ", node.getParams());

    node.connect(ctx.destination);
    audioOut.setRef(node);
  }
  catch (err) {
    op.setUiError("FaustError", `Error compiling node: ${err}`);
    node.disconnect();
    node = undefined;
    audioOut.set(null);
  }
}

faustEditor.onChange = () => {
  // Restart the timeout so as to not spawn excessive compiler processes
  clearInterval(faustEditor.debouncer);
  faustEditor.debouncer = setTimeout(compile, DEBOUNCE_TIME);
};

async function importFaustwasm() {
  const blob = new Blob([attachments.faustwasm], { "type": "application/javascript" });
  const url = URL.createObjectURL(blob);
  try {
    const module = await import(url);
    return module;
  }
  catch (err) {
    op.setUIError("FaustError", err, 2);
  }
  finally {
    URL.revokeObjectURL(url);
  }
}

op.init = async () => {
  const Faust = await importFaustwasm();

  console.table(Faust);
  const {
    instantiateFaustModule,
    LibFaust,
    FaustWasmInstantiator,
    FaustMonoDspGenerator,
    FaustPolyDspGenerator,
    FaustMonoWebAudioDsp,
    FaustCompiler,
  } = Faust;

  try {
    const module = await instantiateFaustModule();
    const libFaust = new LibFaust(module);
    const compiler = new FaustCompiler(libFaust);

    faustModule = {
      "compiler": compiler,
      "FaustWasmInstantiator": FaustWasmInstantiator,
      "FaustMonoDspGenerator": FaustMonoDspGenerator,
      "FaustPolyDspGenerator": FaustPolyDspGenerator,
      "FaustMonoWebAudioDsp": FaustMonoWebAudioDsp,
    };

    await compile();
  }
  catch (err) {
    op.setUiError("FaustError", `Cannot fetch LibFaust: ${err}`, 2);
  }
};

