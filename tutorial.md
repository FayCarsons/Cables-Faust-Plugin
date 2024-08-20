# Using Faust in Cables.gl

The aim of this tutorial is to get you comfortable writing your own embedded DSP scripts in the (Cables.gl)[https://www.cables.gl] platform using the (Faust)[https://www.grame.fr] operator that I developed. We will go over a series of examples that demonstrate all of the operator's core features, with links to the the examples so you can fork them and follow along.

## Coming from Faust
If you're not familiar with Cables, you may want to check out their (documentation)[https://www.cables.gl/docs/docs] which is fairly comprehensive.
If you're familiar with other visual DSP/Graphics coding platforms like Max MSP or Pure Data then it should be easy to pick up.

The Faust operator is a single unit in a modular graph of operators. It can be thought of as similar to a Max or Pure Data operator, or, if visual programming interfaces aren't your thing, an OOP class or module functor - it is a black box which takes input (code, MIDI, control signals), returns output (audio) and you don't have to worry about it beyond that.

## Coming from Cables 
Faust is a DSP scripting language. It allows you to build portable synthesizer apps (think VSTs, Web Audio nodes) with a high-level functional language reminiscent of Haskell or Standard ML. A Faust app can be thought of as one pure function of time and any user-added parameters..

If you're unfamiliar with Faust, before going through this tutorial I suggest you read the (documentation on the website)[https://faust.grame.fr/] and try the (Faust IDE)[https://faustide.grame.fr/] where there are lots of examples and you can quickly write and play synthesizers.

# Getting started 
Once you've gone through any prerequisites, create a Cables account if you don't have one and open (this example)[cables.gl/foo]. This is our equivalent to a "hello world". There's Cables boilerplate (the `main loop` and `play button` ops), our Faust operators (`FaustContext` and `FaustInstance`), and some control sources (`slider`). 

Cables follows a convention where some ops require there be both a "context operator", like our `FaustContext` or the Sidebar, and child ops that receive that context, like our `FaustInstance` or the Sidebar operators. In our case the `FaustContext` is the operator that receives our Faust code and produces a context that can be used to instantiate any number of synthesizers(our `FaustInstance`) that run that code. Always prefer that one-to-many relationship over creating context-instance pairs that are running the same synth, as that redundancy could slow down your patch and cause audio dropouts. 

To your right there should be a window with two sliders, if you move these sliders around you'll hear the synth change in pitch or timbre. These sliders correspond to the two `slider` operators in the patch view. Trace their outgoing connections to the `FaustInstance` and you'll see they are connected to its `frequency` and `detune` ports respectively. These ports are dynamically generated based on the parameters of your Faust script. Looking in the `FaustContext` operator's code editor (click on the operator and a sidebar with an `edit` button should appear), you can see the script:

```dsp 

import("stdfaust.lib");

N = 8;

oscillator(index, frequency, detune) = os.sawtooth(frequency + index * detune);
drone(oscillator_count, frequency, detune) = par(i, oscillator_count, oscillator(i, frequency, detune));

frequency = hslider("frequency", 110, 20, 20000, 1);
detune = hslider("detune", 0, -10, 10, 0.01);

process = drone(N, frequency, detune) :> /(N);
```
If you are new to Faust this may be overwhelming, so I'll point out the relevant lines:
```dsp 
frequency = hslider("frequency", 110, 20, 20000, 1);
detune = hslider("detune", 0, -10, 10, 0.01);
```

This is how we declare parameters. They can be buttons (`foo = button("foo")`), checkboxes (`foo = checkbox("foo")`), or sliders like the ones in  our current script. When you save a script, these parameters will show up as ports on your `FaustInstance` operator(s). You can 
