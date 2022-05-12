/* eslint-disable prefer-destructuring */
/* eslint-disable no-restricted-syntax */
const { writeFileSync, readFile } = require('fs');
const utils = require('./utils');

function fileTimings(vids, dataPath, destPath) {
  // Get the timing of each file and save in a json for reading
  const data = {};
  let prevEnd;
  let cameraStart;
  let maxfDur = 0.0.toExponential;
  let ind = 0;
  let firstFileID;
  let newCount;
  const numFiles = vids.length;

  for (const [idx, file] of vids.entries()) {
    console.log(`    Processing ${idx + 1} of ${numFiles} for this camera: ${file}`);

    try {
      // Get video timing info from the geo data
      const [startTime, duration, fDur] = utils.processVid(file, destPath);
      maxfDur = Math.max(maxfDur, fDur);

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
            console.log(`Fixing timing for GP${indStr}${fileID}.MP4 by ${utils.makeSeconds(timeDiff)}...`);
            data[`${dataPath}/GP${indStr}${fileID}.MP4`].start_time += timeDiff;

            console.log(`Fixing timing for ${ind - newCount}_blank.mp4 by ${utils.makeSeconds(timeDiff)}...`);
            data[`${destPath}/${ind - newCount}_blank.MP4`].start_time += timeDiff;
            indCount -= 1;
            newCount += 1;
          }

          // Fix the first file in the GoPro grouping too if it's not the absolute first video
          console.log(`Fixing timing for GOPR${fileID}.MP4 by ${utils.makeSeconds(timeDiff)}...`);
          data[`${destPath}/GOPR${fileID}.MP4`].start_time += timeDiff;

          // Adjust the camera start time if the first video changes
          if (fileID === firstFileID) {
            cameraStart = data[`${dataPath}/GOPR${fileID}.MP4`].start_time;
          }
        }

        // Specify the blank video made between filess and how long it should be
        const blankFile = `${destPath}/${ind}_blank.MP4`;
        data[blankFile] = {};
        data[blankFile].start_time = prevEnd;

        // Adjust the timing for the new blank video too
        if (timeDiff < 0.0) {
          console.log(`Fixing timing for ${ind}_blank.mp4 by ${utils.makeSeconds(timeDiff)}...`);
          data[`${destPath}/${ind}_blank.MP4`].start_time += timeDiff;
        }

        // Get the latest time difference to know how long the blank should be
        timeDiff = Math.max(timeDiff, 0.0);
        data[blankFile].duration = timeDiff;

        // Get the new end time for calculating the next blank video's length
        prevEnd = startTime + duration;
      }

      // Save some high level info on the video
      data[file] = {};
      data[file].start_time = startTime;
      data[file].duration = duration;

      ind += 1;
    } catch (err) {
      console.log(err);
    }
  }

  // Save the concat file info for analysis across cameras
  data.concat_start = cameraStart;
  data.concat_dduration = prevEnd - cameraStart;
  data.fps = 1 / maxfDur;

  // Write the json so it can be referenced later
  writeFileSync(`${destPath}/FileTimings.json`, JSON.stringify(data));
}

function cameraTimings(cameras, destPath) {
  const timingData = {};
  timingData.vid_start = Infinity;
  timingData.fps = Infinity;
  timingData.vid_stop = 0;

  // Grab high level info for each camera
  for (const camera of cameras) {
    const data = JSON.parse(readFile(`${destPath}/${camera}/FileTimings.json`, 'utf8'));

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

module.exports = {
  fileTimings,
  cameraTimings,
};
