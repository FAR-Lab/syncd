/* eslint-disable max-len */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-console */
/* eslint-disable prefer-destructuring */
/* eslint-disable no-restricted-syntax */
const { writeFileSync, readFileSync } = require('fs'); // File structure module makes life easier
const utils = require('./utils'); // Custom syncd utils functions

// Get the timing of each file and save in a json for reference in other functions
// and for calculating duration of blank videos to sync between cameras
// Only called within a single camera
async function fileTimings(vids, dataPath, destPath) {
  const data = {};
  let prevEnd;
  let cameraStart;
  let maxfDur = 0.0;
  let ind = 0;
  let firstFileID;
  let newCount;
  const numFiles = vids.length;
  let idx = 0;

  for (const file of vids) {
    console.log(`    Processing ${idx + 1} of ${numFiles} for this camera: ${dataPath}/${file}`);
    idx += 1;

    try {
      // Get video timing info from the geo data
      const [startTime, duration, fDur] = await utils.processVid(`${dataPath}/${file}`);

      // Get the highest frame time length for all videos -> we need to make the consistent fps
      // across cameras to be the minimum FPS across cameras for the videos' integrity
      maxfDur = Math.max(maxfDur, fDur);

      // Get the ID for the first file in a camera's recordings
      if (ind === 0) {
        firstFileID = file.split('GOPR')[1].split('.MP4')[0];
      }

      // Get difference in time with the previous file and add a buffer video if necessary
      if (ind === 0) {
        prevEnd = startTime + duration;
        cameraStart = startTime;
      } else {
        // Account for the duration being full length for broken up videos.
        // If video broken up, ignore the offset
        let timeDiff = startTime - prevEnd;

        // If the time diff is neg, this means an adjustment is needed
        if (timeDiff < 0.0) {
          const fileID = file.split('GP')[1].slice(2).split('.MP4')[0];
          const fileInd = file.split('GP')[1].split(fileID)[0];
          let indCount = Number(fileInd) - 1;
          newCount = 1;

          // If an offset is needed, then it will have to be applied to all of the
          // previous videos too, loop through this and adjust all previous videos, including blanks
          while (indCount > 0) {
            let indStr = indCount;
            if (indCount < 10) {
              indStr = `0${indCount}`;
            }
            // console.log(`Fixing timing for GP${indStr}${fileID}.MP4 by ${utils.makeSeconds(timeDiff)}...`);
            data[`${dataPath}/GP${indStr}${fileID}.MP4`].start_time += timeDiff;

            // console.log(`Fixing timing for ${ind - newCount}_blank.mp4 by ${utils.makeSeconds(timeDiff)}...`);
            data[`${destPath}/${ind - newCount}_blank.MP4`].start_time += timeDiff;
            indCount -= 1;
            newCount += 1;
          }

          // Fix the first file in the GoPro grouping too if it's not the absolute first video
          // console.log(`Fixing timing for GOPR${fileID}.MP4 by ${utils.makeSeconds(timeDiff)}...`);
          data[`${dataPath}/GOPR${fileID}.MP4`].start_time += timeDiff;

          // Adjust the camera start time if the first video changes
          if (fileID === firstFileID) {
            cameraStart = data[`${dataPath}/GOPR${fileID}.MP4`].start_time;
          }
        }

        // Specify the blank video made between files and how long it should be/when it starts
        // based on when the last recorded video ended
        const blankFile = `${destPath}/${ind}_blank.MP4`;
        data[blankFile] = {};
        data[blankFile].start_time = prevEnd;

        // Adjust the timing for the new blank video too if necessary
        if (timeDiff < 0.0) {
          // console.log(`Fixing timing for ${ind}_blank.mp4 by ${utils.makeSeconds(timeDiff)}...`);
          data[`${destPath}/${ind}_blank.MP4`].start_time += timeDiff;
        }

        // Get the latest time difference to know how long the blank should be
        timeDiff = Math.max(timeDiff, 0.0);
        data[blankFile].duration = timeDiff;

        // Get the new end time for calculating the next blank video's length
        prevEnd = startTime + duration;
      }

      // Save some high level info on the video
      data[`${dataPath}/${file}`] = {};
      data[`${dataPath}/${file}`].start_time = startTime;
      data[`${dataPath}/${file}`].duration = duration;

      ind += 1;
    } catch (err) {
      console.log(err);
    }
  }

  // Save the concat file info for analysis across cameras later
  // Get the minimum fps across all videos on a camera so we know how to adjust
  // the fps for all videos
  data.concat_start = cameraStart;
  data.concat_duration = prevEnd - cameraStart;
  data.fps = 1 / maxfDur;

  // Write the json so it can be referenced later
  writeFileSync(`${destPath}/FileTimings.json`, JSON.stringify(data), (err) => {
    if (err) {
      console.log(err);
    }
  });
}

// Get the timing for full camera files to know when to add blanks to the beginning/end
// of a camera video in order to sync up and put videos side-by-side
function cameraTimings(cameras, destPath) {
  const timingData = {};
  timingData.vid_start = Infinity;
  timingData.fps = Infinity;
  timingData.vid_stop = 0;

  // Grab high level info for each camera from the individual video processing done earlier
  for (const camera of cameras) {
    const data = JSON.parse(readFileSync(`${destPath}/${camera}/FileTimings.json`, (err) => {
      if (err) {
        console.log(err);
      }
    }), 'utf8');

    timingData[camera] = {};
    timingData[camera].camera_start = data.concat_start;
    timingData[camera].camera_dur = data.concat_duration;
    timingData[camera].camera_stop = data.concat_start + data.concat_duration;
    timingData.vid_start = Math.min(data.concat_start, timingData.vid_start);
    timingData.vid_stop = Math.max(data.concat_duration + data.concat_start, timingData.vid_stop);
    timingData.fps = Math.min(timingData.fps, data.fps);
  }

  // Figure out the buffers needed at the start and end of each camera to sync across cameras
  for (const camera of cameras) {
    timingData[camera].start_buffer = timingData[camera].camera_start - timingData.vid_start;
    timingData[camera].stop_buffer = timingData.vid_stop - timingData[camera].camera_stop;
  }

  // Write the data to a json file
  writeFileSync(`${destPath}/CameraTimings.json`, JSON.stringify(timingData));
}

// Export modules so they can be referenced by other files
module.exports = {
  fileTimings,
  cameraTimings,
};
