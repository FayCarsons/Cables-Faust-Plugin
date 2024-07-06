'use strict'

const TRIGGER_LEN = 50
const DEFAULT_VELOCITY = 100

/// Determine if a parameter is a button  
/// @param {object[]} descriptors  
/// @param {string} address
/// @return {boolean}
function isButton(descriptors, paramAddress) {
  for (const descriptor of descriptors) {
    if (descriptor.address === paramAddress) {
      return descriptor.type === 'button'
    }
  }

  return false
}

/// Get the 'name' portion of a dsp address, I.E. '/dsp/:name'
/// @param {string} address
/// @return {string}
function paramName(address) {
  return address.substring(address.lastIndexOf('/') + 1);
}

// [a] -> int -> ([a], [a])
function splitAt(arr, idx) {
  return [arr.slice(0, idx), arr.slice(idx)]
}

class Control {
  constructor(node, address, context) {
    this.context = context // 'op' context needed for creating a port, setting error messages

    this.address = address
    this.isButton = isButton(node.fDescriptor, address)

    this.initialize()
  }

  /// Create a port for the given parameter
  /// @param {AudioNode} node 
  initialize() {
    console.log(`Initializing node: ${this.address}`)
    const name = paramName(this.address)
    this.port = this.isButton ? this.context.inTrigger(name) : this.context.inFloat(name);
  }

  /// add a callback to port that sets the appropriate param
  /// callback must be passed down from PortHandler so that references to 
  /// other nodes may be captured
  ///
  /// @param {boolean} button - is the parameter attached to this port a button
  /// @param {AudioNode} node 
  /// @param {string} address - the parameter's address
  /// @param {CablesPort} port 
  addCallback(callback) {
    if (!this.port) this.context.setUiError("FaustError", `Cannot update NULL control port ${this.address}`)
    const updateFn = this.isButton ? 'onTriggered' : 'onChange'
    this.port[updateFn] = callback
  }

  // Remove the port from the operator
  drop() {
    this.port.remove()
  }

  get value() {
    return this.port.get()
  }
}

class Audio {
  constructor(node, index, context) {
    this.index = index
    this.context = context
    this.initialize(node)
  }

  initialize(node) {
    this.port = this.context.inObject(`Audio ${this.index}`)
    this.update(node)
  }

  addCallback(node) {
    this.port.onChange = this.createAudioCallback(node)
  }

  /* ---- Audio callbacks ---- */
  /// attach a callback that updates audio connections to the node
  /// @param {AudioNode} node
  /// @param {Number} idx
  /// @param {CablesPort} audioPort
  createAudioCallback(node) {
    return () => {
      if (!node) return

      const input = this.port.get()
      if (input == this.currentInput) return
      else {
        const input = this.port.get()
        if (!(input instanceof AudioNode)) {
          this.context.setUiError("FaustError", `Audio input ${this.index} is not a Web Audio node`)
          return
        }

        try {
          this.currentInput.connect(node)
          this.currentInput = input
        } catch (err) {
          this.context.op.setUiError("FaustError", `Cannot connect audio input ${this.index} to node: ${err}`)
        }
      }
    }
  }

  drop() {
    this.port.remove();
  }
}

export class PortHandler {
  constructor(context) {
    // parameter 'address' -> input port mapping
    this.control = {}
    // audio input ports
    this.audio = []

    // share global context w/ main script
    this.context = context
  }

  /// Whether the current script has the required parameters for polyphony
  /// @return {boolean}
  hasPolyParams() {
    return !!(this.control['/dsp/freq'] && this.control['/dsp/gate'])
  }

  /// Initialize input ports for control-rate inputs
  /// @param {WebAudioNode} node
  /// @return {void}
  updateControl(node) {
    // Get control rate parameters
    const addresses = node.getParams()

    // Remove ports attached to params that do not exist on current node
    this.removeUnusedControl(addresses);

    for (const address of addresses) {
      if (this.control[address]) {

        // If there's already a port for this param, 
        // update its callback to hold a reference to the current node and
        // other potentially new params etc
        console.log(`Updating Control object ${address}`)
        const callback = this.createControlCallback(node, this.control[address])
        this.control[address].addCallback(callback)
      } else {

        // Otherwise create a new node, put it in the control map, and bind a 
        // callback with a reference to the current node to it
        console.log(`Creating new Control object ${address}`)
        this.control[address] = new Control(node, address, this.context.op)
        const callback = this.createControlCallback(node, this.control[address])
        this.control[address].addCallback(callback)
      }
    }
  }

  /* ---- Control callbacks ---- */

  // For control ports callbacks must be created by the PortHandler so that
  // references to other ports can be captured

  /// Create a callback that sets the given parameter of the Web Audio node
  /// @param {WebAudioNode} node 
  /// @param {string} address
  /// @param {CablesPort} paramPort
  /// @return {void => void}
  createControlCallback(node, port) {
    if (port.isButton) {
      if (this.context.voiceMode == this.context.Voicing.Mono) return this.createMonoTriggerCallback(node, port.address);
      else return this.createPolyTriggerCallback(node)
    } else return this.createNumberCallback(node, port.address)
  }

  createMonoTriggerCallback(node, address) {
    console.log(`creating mono trigger callback for ${address}`)
    return () => {
      if (!node) return
      node.setParamValue(address, 1)
      setTimeout(() => node.setParamValue(address, 0), TRIGGER_LEN)
    }
  }

  // NOTE: This is probably not right: currently the 'gate' callback sets 
  // the node's param/keyOn to 'on' and then to 'off' with fixed delay time
  // We probably instead want to handle gate ons and offs separately to 
  // allow for actual gate-like behavior as opposed to the current 
  // trigger-like behavior
  createPolyTriggerCallback(node) {
    console.log(`creating poly trigger callback for '/dsp/gate'`)
    return () => {
      if (!node) return

      // We can assume `freq` is a param in polyphonic mode because its been
      // checked elsewhere
      const pitch = this.control['/dsp/freq'].value
      const gain = this.control['/dsp/gain']?.value
      const velocity = gain && gain !== 0 ? gain : DEFAULT_VELOCITY
      console.log(`Playing midi note: ${pitch} with velocity: ${velocity}`)

      node.keyOn(0, pitch, velocity)
      setTimeout(() => {
        console.log("Note off");
        node.keyOff(0, pitch, velocity), TRIGGER_LEN
      });
    }
  }

  createNumberCallback(node, address) {
    console.log(`Creating number callback for ${address}`)
    return () => {
      if (!node) return
      node.setParamValue(address, this.control[address].value)
    }
  }

  /// Initialize audio input ports 
  /// @param {WebAudioNode} node
  updateAudio(node) {
    if (!node) return;

    const numInputs = node.getNumInputs()

    // Split audio handlers into [0..numInputs] and [numInputs ..]
    // so that any extra handlers can be dropped and 
    const [inside, outside] = splitAt(this.audio, numInputs)

    outside.forEach(audio => { if (audio) audio.drop() })

    if (inside.length !== numInputs) inside.length = numInputs
    this.audio = inside.map((audio, idx) => audio ? audio.addCallback(node, this.context) : new Audio(node, idx, this.context))
  }



  updateContext(ctx) {
    this.context = ctx
  }

  update(node, ctx) {
    this.context = ctx
    this.updateControl(node)
    this.updateAudio(node)
  }

  /// Remove control ports not used by current Faust script
  /// @param {string[]} addresses - current params
  removeUnusedControl(addresses) {
    for (const [address, port] of Object.entries(this.control)) {
      if (!addresses.includes(address)) {
        console.log(`Removing port \`${address}\``)
        port.drop()
        delete this.control[address];
      }
    }
  }

  // For debugging, removes all control input ports
  clearPorts() {
    for (const [addr, port] of Object.entries(this.control)) {
      port.drop()
      delete this.control[addr]
    }
    for (const i in this.audio) {
      this.audio[i].drop()
      delete this.audio[i]
    }
  }

}

export default { PortHandler }
