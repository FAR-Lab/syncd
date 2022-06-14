# syncd
A node package which synchronizes videos. Currently only works with gopro videos. 

Author: @snlee159

## Acknowledgements
@imandel - helped significantly with tool design and debugging. This tool would not have been possible without him.

@DavidGoedicke - helped with distinguishing what to do with sound sync issues.

## Purpose and Context
This package was a collaboration with FARLab at Cornell University in order to make video processing easier prior to video coding for interaction design research.

Any purpose which requires side-by-side videos of the same event to be sync'd would benefit from this package to avoid manual syncing.

## How to Install
Install with npm to run as a node module without the base code:

```
npm install syncd
```

To install with git and contribute/build on syncd:

```
git clone https://github.com/snlee159/syncd.git
cd [package directory]
npm link
npm install syncd
```

or just run with `npx` instead for faster testing.

## How to Use
### Command Line Interface
syncd can be run with the following command and command-line arguments:

```
syncd <path to data> [optional arguments]
```

Where the optional arguments available are as follows:
* `--compute`: options are `GPU` or `CPU`, defaults to `CPU`
* `--destination`: if you'd like the output files to be saved other than where this command is run, give the path here
* `--rotate`: a json format which specifies whether any of the videos should be rotated; uses the following syntax: `{[camera]: rotation_id, [camera2]: rotation_id}`, replace the `[camera]` and `[camera2]` with your camera names (see file structure below) and replace `rotation_id` with whatever rotation you desire where `1` rotates the video 90 degrees clockwise and `2` rotates the video 90 degrees counter-clockwise; there is currently no code for a 180 degree rotation
* `--all-files`: if you'd like to keep all the supporting files used for the sync, make this `true`, `false` otherwise, defaults to `false`. Supporting files include empty buffer files and individually combined video streams from a single camera. Warning: these files can be quite large and it is not recommended to keep them unless you have significant storage space.

### Exceptions and Things That May Break

The `<path to data>` file structure must follow a very specific format:
```
<path to data>
|-participant_1
| |-camera_1
| | |-GOPRXXXX.MP4
| | |-GP01XXXX.MP4
| | |-GP02XXXX.MP4
| | |...
| |-camera_2
| | |-GOPRYYYY.MP4
| | |-GP01YYYY.MP4
| | |...
| |...
|-participant_2
| |-camera_1
| | |-GOPRZZZZ.MP4
| | |-GP01ZZZZ.MP4
| | |...
| |-camera_2
| | |-GOPRAAAA.MP4
| | |-GP01AAAA.MP4
| | |...
| |...
|...
```
This is good practice in general for data analysis to have a similar structure and so will not be changed in future improvements.

syncd requires the above GoPro file formmats. If those are not used, syncd cannot run properly at this point. The participants and cameras can be named anything as long as the names **do not** have any spaces in them. Use either camelcase or underscores.

syncd will run with the following steps:
1. Start with the first participant
2. Loop through each camera
3. Merge all files to one MP4 for a participant's camera
4. Add buffers to align timing between cameras to the start/end of each file made in (3)
5. Put all camera files side by side and save as syncd_video.MP4 within the participant folder (if no destination set)
6. Repeat from step 1 with the next participant

Files will be saved in the same format as above. If no destination is set, these files will be saved where the code is run. If the destination is set, new folders will be made to mimic the above file structure.

**Note**: Depending on your file size, syncd will take a long time to run. For example, for a participant with ~1 hour of footage on each camera will take about 2 hours to process with GPU enabled with the `--compute` command line argument.

## Future Improvements
Future improvements will include the following:
* More GoPro file formats accepted
* Allowing different file resolutions to be saved
* Automatic GPS syncing with sync'd .geojson files
* Speeding up computation more