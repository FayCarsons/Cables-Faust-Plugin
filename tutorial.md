# Using Faust in Cables.gl

The aim of this tutorial is to get you comfortable writing your own embedded DSP scripts in the [Cables.gl](https://www.cables.gl) platform using the [Faust](https://faust.grame.fr) operator that I developed. We will go over a series of examples that demonstrate all of the operator's core features, with links to example so you can follow along. 

## Glossary

- Operator(op): this is a single unit in a Cables.gl patch, it can be a number, a graphics primitive, or IO. It has zero or more inputs and outputs. clicking on an operator will open its menu, which includes its parameters.

- Port: This is an input or output on an operator. Ports can have one of a small handful of types, numbers, triggers, strings. A port can be connected to a port on another operator by clicking one and then the other, creating a cable that illustrates their connection.

# Coming from Faust
If you're not familiar with Cables, you may want to check out their [documentation](https://www.cables.gl/docs/docs) which is fairly comprehensive.
If you are familiar with other visual DSP/Graphics coding platforms like Max MSP or Pure Data then it should be easy to pick up.

The Faust operator is a single unit in a modular graph of operators. It can be thought of as similar to a Max or Pure Data operator, or, if visual programming interfaces aren't your thing, an OOP class or module functor - it is a black box which takes input (code, MIDI, control signals), returns output (audio) and you don't have to worry about it beyond that.

To get started, open up [this cables patch](https://cables.gl/edit/KB1y0m). This is our "Hello world", an oscillator and envelope with control over frequency and a play button. There is some Cables boilerplate, the `MainLoop` and `PlayButton` operators - these are just here to give us a blank canvas and a button that can start audio on the page. You will also see the `SideBar`, `Slider`, and `Button` operators, these correspond to the UI elements in the widow to the right. 

Cables follows a convention where some operators, like our `SideBar`, provide a "context" for other operators. Our Faust operator follows this. The `FaustContext` takes our code and desired voicing (`Monophnoic` or `Polyphonic`), and produces a "context" with which we can instantiate any number of synthesizers which run that code, with that voicing. In general, prefer taking advantage of this as opposed to creating context-instance pairs for synths that are running the same Faust script as that can become prohibitively expensive.

Next, lets look at parameters - how do we get signals into our Faust program? Click the Faust operator and then the `edit` button in the op menu on the right. You should see some Faust code. In that code there are two parameter declarations: 

```dsp
frequency = hslider("Frequency", 220, 10, 10000, 1);
play = button("play");
```
Looking at the `FaustInstance` operator, it has two ports named `frequency` and `play`. These are connected to the `Slider` and `Button` operators respectively. This is the general pattern for getting signals into our Faust program. Parameters declared in the Faust script will appear as ports on the `FaustInstance` operator, which we can then attach any Cables operator for control over those parameters. Sliders, regardless of orientation, become number inputs, buttons become stateless triggers, and checkboxes become latches.

This holds true for audio input, a Faust program that takes N channels of audio input will result in a `FaustInstance` with an audio input expecting a Web Audio node with N outputs. This is subject to the usual Web Audio rules, I.E. mono outputs connected to a stereo input will be duplicated for each stereos channel. Cables does not, as far as I know, have any Web Audio operators with >2 audio outputs, though, so you only need to concern yourself with the mono and stereo cases unless you plan on coding your own Cables operator.

One place where parameter declaration differs is in the cases of MIDI or polyphonic Faust programs. See [MIDI and Polyphony](#midi-and-polyphony).

# Coming from Cables 
Faust is a DSP scripting language. It allows you to build portable synthesizer apps (think VSTs, Web Audio nodes) with a high-level functional language reminiscent of Haskell or Standard ML. A Faust app can be thought of as one pure function of time and any user-added parameters.

If you're unfamiliar with Faust, before going through this tutorial I suggest you read the [documentation on the website](https://faust.grame.fr/) and try the [Faust IDE](https://faustide.grame.fr/) where there are lots of examples and you can quickly write and play synthesizers.

First, open up [this example](https://cables.gl/edit/KB1y0m). This is our "Hello world", a simple synthesizer with a slider to set pitch and a button to play a note. Let's walk through how to put together a patch like this.

Following Cables' convention of context-providing operators and children that receive context, building a Faust program requires instantiating a `FaustContext` and a `FaustInstance` operator. The `FaustContext` is our compiler, it has a built-in string editor where you write your code and a switch to choose between monophony and polyphony. In our demo patch you'll see it's `Context` output port is connected to the `FaustInstance`'s `Context` input. Once a `FaustInstance` has received the context it will automatically use it to instantiate a Web Audio node that is running your code and populate its ports with the Faust program's parameters. Like any Web Audio operator, it has an audio out that you can connect to another op or an `output` op to have it sent to your speakers.

If we open the code editor of the `FaustContext` operator we'll see this section:

```dsp 
frequency = hslider("Frequency", 220, 10, 10000, 1);
play = button("play");
```
Looking at the ports on our `FaustInstance` you'll see a number port named `frequency` and a trigger port named `play` corresponding to these Faust parameters. This is how you get signals into your Faust program. The operator supports all Faust parameter primitives, though UI layout functions like `hgroup` or `tgroup` have no effect. 

A short rundown on the behavior of Faust parameter primitives in this operator:

- `button`: a stateless 20ms trigger. A direct translation of Cables' trigger type 
- `checkbox`: a stateful latch, one Cables' trigger will set the state to `on`, another will turn it back off
- `hslider`, `vslider`, `nentry`: These become number ports. They will clamp input to the range specified in the Faust script.

Below this section of our Faust code we see the actual DSP, the one thing that I will explain is the `process` keyword, the rest is out of the scope of this document. 
`process` is like GLSL's `FragColor` or `outColor`. It is the output of our Faust program. A trivial Faust program could be written `process = _`, which produces a synthesizer which takes one audio input and passes it through. In polyphonic mode there is also the `effect` keyword, which will be used as a global effect on all the voices of your synth.

An audio input port will be created for any Faust program that takes audio, like our trivial Faust program from above. Audio inputs must be an instance of the `AudioNode` class, this is to prevent runtime errors from attempting to connect non-Web Audio objects to a Faust node. 

Currently, with Cables' lacking any Web Audio operators that output more than 2 audio channels, it only handles mono and stereo. Though, theoretically, if you were to code your own operator that outputs >2 channels our Faust operator could interface with it. 

A `FaustInstance` can accept one other type of input: MIDI. FOr more information see [this section](#midi-and-polyphony) and the linked demos.

# MIDI and Polyphony

In general, if you are unfamiliar with Faust or how Faust MIDI integration works, see [the Faust MIDI documentation](https://faustdoc.grame.fr/manual/midi/).

There are two ways to incorporate MIDI into a Faust program inside of the `FaustContext` operator:

- Using the `declare options [midi:on]` directive and labeling MIDI controlled parameters: 
  ```dsp 
  declare options "[midi:on]":

  mod = hslider("mod[midi: ctrl 1]", 0, -2, 2, 0.01);
  ```
- Running the program in polyphonic mode (a parameter on the `FaustContext` operator), in which case it will expect the following parameters: 
  - `freq` for frequency in Hz or `key` for MIDI for MIDI note number (0-127)
  - `gate`: note on trigger 
  - `gain` **optional** velocity normalized to 0-1  or `vel`/`velocity` for MIDI velocity (0-127)

Doing either of these things will cause each `FaustInstance` to create an `Object` port which expects MIDI messages.
Normal, non-MIDI, parameters as well as audio input can coexist with MIDI input, allowing for more complex control schemes and DSP programs such as polyphonic granular synthesizers or vocoders. 
Some examples of MIDI and polyphony in use with the Faust Cables operator can be found in the [polyphony example](https://cables.gl/edit/9qS0Ck) and the [vocoder example](https://cables.gl/edit/lSPb1m)
