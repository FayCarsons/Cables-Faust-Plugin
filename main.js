const LIB = 'libFaust-0.0.42.js'

// Time to wait to compile after a keystroke
const DEBOUNCE_TIME = 333

const outTrigger = op.outTrigger('Loaded')
const faustEditor = op.inStringEditor("Faust Code")
const voicing = op.inSwitch('Mode', ['Monophonic', 'Polyphonic'], 'Monophonic')
const voices = op.inInteger("Voices")
const note = op.inInteger("Note")
const gate = op.inTrigger("Gate")

let faustModule;
let node;
let ctx;
let paramMap;

function MIDItoFreq(midiNote) {
  return (440 / 32) * (2 ** ((note - 9) / 12))
}

gate.onChange = () => {
  if (!node) return

  const hz = MIDItoFreq(note.get())
  // Play note
}

async function compile() {
  if (!faustModule || !ctx) return

  const {
    compiler,
    FaustMonoDspGenerator,
    FaustPolyDspGenerator,
  } = faustModule;

  const content = faustEditor.get()

  let generator = {
    'Monophonic': () => new FaustMonoDspGenerator(),
    'Polyphonic': () => new FaustPolyDspGenerator()
  }[voicing.get()]();

  try {
    await generator.compile(compiler, "dsp", content, "")

    node = await {
      'Monophonic': () => generator.createNode(ctx),
      'Polyphonic': () => generator.createNode(ctx, voices.get())
    }()

    for (const param in node.getParams) {
      const listener = op.inFloat(param);
      paramMap[param] = listener;
      listener.onChange = () => node.setParamValue(param, listener.get())
    }

    node.connect(ctx.destination)
  } catch (err) {
    op.setUIError("FaustError", err, 2)
    node = null
  }
}

faustEditor.onChange = () => {
  // Restart the timeout so as to not spawn excessive compiiler processes
  clearInterval(faustEditor.debouncer);
  faustEditor.debouncer = setTimeout(compile, DEBOUNCE_TIME)
}

op.init = async () => {
  const name = '/assets/654a0b835ae6c809058fb603/' + LIB;
  const url = op.patch.getFilePath(name);
  let fullUrl = url;
  if (op.patch.isEditorMode())
    fullUrl = window.location.origin + url;
  const {
    instantiateFaustModule,
    LibFaust,
    FaustWasmInstantiator,
    FaustMonoDspGenerator,
    FaustPolyDspGenerator,
    FaustMonoWebAudioDsp,
    FaustCompiler,
  } = await import(fullUrl);
  const module = await instantiateFaustModule();

  const libFaust = new LibFaust(module);
  const compiler = new FaustCompiler(libFaust);

  faustModule = {
    compiler: compiler,
    FaustWasmInstantiator: FaustWasmInstantiator,
    FaustMonoDspGenerator: FaustMonoDspGenerator,
    FaustPolyDspGenerator: FaustPolyDspGenerator,
    FaustMonoWebAudioDsp: FaustMonoWebAudioDsp,
  }
  ctx = new AudioContext()
};
