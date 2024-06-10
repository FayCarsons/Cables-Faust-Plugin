"esversion: 9";

console.clear();

// Time to wait to compile after a keystroke
const DEBOUNCE_TIME = 333;
const DEFAULT_SCRIPT = `import("stdfaust.lib");

// Simple filter ping synth with trigger and frequency
freq = hslider("Frequency", 440, 10, 10000, 1);
trig = button("Ping");

impulse = trig : ba.impulsify;
resonator(in, f) = in : fi.resonbp(f, 70, 1.1);
ping(f) = resonator(impulse, f);

process = ping(freq);
effect = dm.freeverb_demo;`;

const outTrigger = op.outTrigger("Loaded");
const faustEditor = op.inStringEditor("Faust Code");
faustEditor.set(DEFAULT_SCRIPT);
op.setPortGroup("Faust script", [faustEditor]);
const voicing = op.inSwitch("Mode", ["Monophonic", "Polyphonic"], "Monophonic");
const voices = op.inInt("Voices");
const note = op.inInt("Note");
const gate = op.inTrigger("Gate");
const audioOut = op.outObject("Audio out");
let faustModule;
let node;

const ctx = CABLES.WEBAUDIO.createAudioContext(op)

function MIDItoFreq(midiNote) {
  return (440 / 32) * (2 ** ((midiNote - 9) / 12));
}

gate.onTriggered = () => {
  if (!node) {
    console.log("node is NULL");
    return;
  }

  node.setParamValue("/dsp/Frequency", note.get())
  node.setParamValue("/dsp/Ping", 1)
  setTimeout(() => node.setParamValue("/dsp/Ping", 0), 10)
};

async function compile() {
  if (faustModule == undefined) {
    console.error("FaustModule is undefined!");
    return
  }

  const {
    FaustMonoDspGenerator,
    FaustPolyDspGenerator,
    compiler,
  } = faustModule;

  const code = faustEditor.get();

  const voicingVal = voicing.get();

  // Avoiding using uninitialized variables
  let generator = {
    "Monophonic": () => { return new FaustMonoDspGenerator(); },
    "Polyphonic": () => { return new FaustPolyDspGenerator(); }
  }[voicingVal]();

  try {
    await generator.compile(compiler, "dsp", code, "");

    if (node) node.disconnect()
    node = await generator.createNode(ctx);

    node.connect(ctx.destination);
    audioOut.setRef(node);
  }
  catch (err) {
    console.error(`Error compiling node: ${err}`);
    node = undefined;
    audioOut.set(null)
  }
}

faustEditor.onChange = () => {
  // Restart the timeout so as to not spawn excessive compiiler processes
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

