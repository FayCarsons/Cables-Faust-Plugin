
"esversion: 9";

console.clear();

// Time to wait to compile after a keystroke
const DEBOUNCE_TIME = 333;
const DEFAULT_SCRIPT = `import("stdfaust.lib");

// Simple filter ping synth with trigger and frequency
freq = hslider("Frequency [midi:keyon 0]", 440, 10, 10000, 1);
trig = button("Ping [midi:keyon 0]");

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
let paramMap;

const ctx = CABLES.WEBAUDIO.createAudioContext(op)

function MIDItoFreq(midiNote) {
  return (440 / 32) * (2 ** ((midiNote - 9) / 12));
}

// NOTE: NOT WORKING - no sound even though the web audio routing is not 
// throwing any errors
gate.onTriggered = () => {
  console.log("Pressed!");
  if (!node) {
    console.log("node is NULL");
    return;
  }

  // Failing
  try {
    node.keyOn(0, 64, 127)
  } catch (err) {
    console.log(`<keyOn> failed: ${err}`)
  }
  node.setParamValue(0, 440)
  node.setParamValue(1, 1)
  setTimeout(() => node.setParamValue(1, 0), 10)
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

    console.log("compiled!");

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
    // Not a function ??
    // op.setUIError("FaustError", err, 2);
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

    if (!compiler) console.error("COMPILER IS NULL TO BEGIN WITH")

    faustModule = {
      "compiler": compiler,
      "FaustWasmInstantiator": FaustWasmInstantiator,
      "FaustMonoDspGenerator": FaustMonoDspGenerator,
      "FaustPolyDspGenerator": FaustPolyDspGenerator,
      "FaustMonoWebAudioDsp": FaustMonoWebAudioDsp,
    };
    console.log("Faust module before compilation:")
    console.table(faustModule)

    await compile();
  }
  catch (err) {
    op.setUiError("FaustError", `Cannot fetch LibFaust: ${err}`, 2);
  }
};

