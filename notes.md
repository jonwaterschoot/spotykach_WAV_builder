



## new sample pack by jonwtr
- the sample pack should be added to the filebrowser, make a new readme.md file describing the sounds, a series of noisy textures, field recording, voice sounds, ... the links for the creator of this pack should point to the readme in the github repo of this project. plus a link to IG and YT @jonwtr


## create a changelog file and prepare a setup for versioning 

- for now we can just write up a changelog.md file in the root of the project
- we should prepare a setup for versioning and then perhaps display the version in our actual app

## add to future ideas / roadmap
- make the app standalone / installable?


-----------------------------------------------------------
-- vvvvvvvvvvv !!done / changed / reviewed!! vvvvvvvvvvv --
-----------------------------------------------------------

## Color and looks
v - Tape Blue, Yellow etc, ... > title of the tape view should use the var synthux colors, now they're just generic colors, the titles color should be based on the same colors as we're applying to the tape icons in the left bar
v - in tape view the play button with word "play" has lost its spacing in the previous layout the button took up the available space up while the rightside icons were aligned to the right

## Tape view playhead behaviour:
v - in tape view we make the waveform upon playing show a playhead that is clickable and draggable to set the play position.
v - when using spacebar, the latest highlighted card starts playing. pressing spabear agin will stop any currently playing card.


## Editor view:

v- grayed out button behaviour for trim is applied, we need to do the same for normalize
v  - perhaps we should add a field to the file object that stores the applied actions, so we can check if the file has been trimmed, normalized, looped, etc. "Looped" is actually already implemented as a label for the browser. But we want a specific file checker that checks if the file has been trimmed  or normalized. Looping can be applied multiple times as a creative tool and should always be available. 
v - we shoulld be able to remove versions from the history tab, without confirmation
v - the way the save changes and save to tape works is confusing for the users.
v - Perhaps we should have a "apply changes" button and a "assign to tape" button.
v- The tape icon is messing up the layout
v  - It's also causing the title to be limited in width.
v  - Display the tape icon first, up to 30% smaller than it currently is, right of the icon is the title;
v  - below comes the the subtext editing waveform;
v  - below this the editing bar; 
v - when the save to tape button is grayed out it should display a tooltip that says "file has not changed"
V Half implemented- we want to check whether the trim and normalize button have already been applied to the current loaded file, if so they should be disabled / grayed out, help text can display "already applied"
v - add a reset button next to / after the other buttons to discard and reload with modal confirmation


## editor behaviour
- upon clicking normalize, that file should be highlighted in the left bar, and the normalize button should be disabled as it was already applied, only after a new edit like trim it should become available again.
- The same goes for our other editing tools, they should be greyed out when the file has not changed. And the newly created version should always be the active one and the highlighted one in the left bar.

## about / docs
- add more info to the current about section to the app
- create a readme.md file in the root of the project
- we should mention sources and used tech in the readme
- license for my work is "Do What The Fuck You Want To Public License
- used tech is possibly copyrighted by Google, react, vite, nodejs, check this what needs to be mentioned
- add a link to the github repo



## export 
- allow export of a single file
- allow export of a single tape

## file browser
- we add a section to load samples from a folder from Synthux Horror Sample Pack, it should be a different modal that allows auditioning these samples and adding them to the pool.
- create the folder where these samples should be placed, so all users have them available from a folder in this github repo
- in the future more sample packs could be added, hence we should already prepare the logic

## drag and drop
- drag and drop files between slots and tapes: 
    - option to duplicate
    - click and drag should be able to work on the tape icons. When a file is dragged to a tape icon in the left bar it should be added to that tapes first free slot
    - when no slot is available on that tape a popup should warn the user and do nothing when clicking ok or "got it", when it can be assigned a modal that auto fades away says added to tape x, slot x.



## LOOP
upon clicking apply loop:
- the loop should apply to the trimmed part and save that trimmed part, hence the logic about the mex crossfade lenght should be applied to the trim length.
- when the user has clicked create loop, the created file should be the new active file in the editor

- when a file is looped a label is added to the saved blocks in the browsers and the main view

--

## editor
en clicking on save to tape, we should check if the file has changed, the logic of this button should be:
- if the file has not changed, do not save another version, but make it the active assigned file to the tape, adding the tape icon to the filebrowser helps indicate that this is the version assigned to the tape
- if the file has changed, save it as a new version and make it the active assigned file to the tape


## main tape view
instead of overlaying the play and delete buttons on the slots in the tape view, we should have a dedicated area for the tape view, with the file name, the length of the file, version label, a label if it is looped, a play button and a delete button (removes from the tape, not the pool)
instead of the wave emoticon we add a minified waveform, that is not interactive.
- add a play button to the main tape view
- the overview shows:
  - a minified waveform
  - the name of the file (already exists)
  - the length of the file (already exists)
  - version label (already exists)
  - a label if it is looped (already exists)
  - a play button
  - a delete button (removes from the tape, not the pool)



## rearrange editing and view tools
- buttons for view and edit should be separate
- top bar has the editing tools: fades, loop etc.
- bottom bar has the view tools: zoom, fit etc. + the trim bar / warning



## make loop
- extend to 10 seconds
- or limit to half of the trimmed length if loop is smaller
- we could perhaps use percentage instead of sec. so that the crossfade of a loop never can extend the 50% mark

## waveform editing:
- adding new feature normalizing to -1db


## the trim bar 42 sec
- always show a button to reset the trim to 42sec.
- currently the warning pops up from the left and then moves to the middle. Give it space to always appear, a placeholder is stating the current length of the file, when it is too long it should be red and explain the warning (if a file is longer than 42 sec. SK will read it, but it will only load the first 42sec into the buffer).

## zoomlevel: Lets rethink our zoom level approach for the waveform:

v - fit all and fit trim icons should be different,
  v  - e.g. fit all paerhaps a button of two trim sliders and a waveform in between
  v  - fit trim the same trim sliders but a scissor icon instead of the waveform.
v - an apply trim button should be added to the trimbar, or below it to apply the trim to the file. 
v - below our waveform we can put a little help text explaining the features of the button you're hovering over.

v zoom level button and slider - not working in tandem:
v - the slider is not reflecting the zoom level when zooming in or out with scolling or using the click on - / +

v Clicking and dragging inside the waveform should move the playhead
v - zooming in should zoom in to the playhead
v - zooming out should zoom out to the playhead


 v   - intial loading should fit the the whole waveform in the viewport
 v   - there should be a fit to viewport button
 v   - fit view to trimmed area
 v   - clicking either zoom in or zoom out icon should zoom in increments
 v   - ctrl + mouse wheel should zoom out / zoom in
 v   - when a file loads an is bigger than 42 sec. the trim bar should be set at 42sec. alligning the suggested trim to the middle of the waveform
 v   - when the trim bar is resized above 42sec. it schould show a warning that only the first 42 sec. of A file will be read by Spotykach.
 v   - we can color the area outside the trimbar in a redish color to indicate that it will not be read by Spotykach.  
 v   - an apply button should be added to the trimbar, or below it to apply the trim to the file. 
 v  - the scrollbar is currently styled by the browser lets make it look better.




