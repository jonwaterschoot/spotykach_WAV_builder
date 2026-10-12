I want to build a small tool that allows grabbing samples, either fgrom our existing sample browser or from added files, with a lot of random tools:

We'll make this a standalone app door that can save it's content to the Studio / samples user project library - the filepicker can use the same interface as the sample browser, but without the extra options klisted , just the list, preview and add to mangle pool

the main idea is to build samples 42 s, that contain a bunch of different snippets to use on SK, or another sampler, that could yield unexpected and varrying results that are more experimental and less predictable.

- grab random snippets from samples ranging from sub sec to seconds
- normalize the snippets seperately to match an overall loudness
- allow (short) crossfades between parts ranging from 0 to e.g. 3000ms 
- allow setting sliders to make the random settings
- allow setting random playback direction per snippet
- attempt pitch detection per snippet and suggest repitch to C

To speed up results of the slider settings generate multiple files, with a setting to save to a temp pool