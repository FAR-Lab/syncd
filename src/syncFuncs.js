/* eslint-disable no-await-in-loop */
/* eslint-disable no-console */
/* eslint-disable prefer-destructuring */
/* eslint-disable no-restricted-syntax */
const fs = require('fs'); // File system module, whole thing
const {
  readFileSync, writeFileSync,
} = require('fs'); // File system module, makes life easy
const utils = require('./utils'); // Custom utils functions
const timing = require('./timings'); // Functions for measuring the timing of videos
const ffmpeg = require('./ffmpegCmds'); // Functions for running ffmpeg commands

// Combine the videos for a single camera into one MP4 file
async function makeCameraVid(dataPath, destPath, camera, compute, allFiles) {
  // Pull the timing data and high level camera info in
  const data = JSON.parse(readFileSync(`${destPath}/${camera}/FileTimings.json`, 'utf8'));
  const cameraData = JSON.parse(readFileSync(`${destPath}/CameraTimings.json`));
  const speed = cameraData.fps;

  // Make a list of the file ordering to combine for an easy ffmpeg command
  const mergeFiles = [];

  // Make a start buffer if necessary to align timing across cameras
  if (cameraData[camera].start_buffer > 0.0) {
    const blankFile = `${destPath}/${camera}/StartBuffer.MP4`;
    const durationStr = utils.getDurStr(utils.makeSeconds(cameraData[camera].start_buffer));
    console.log(`Start Buffer for ${camera}: ${durationStr}`);
    if (!fs.existsSync(blankFile)) {
      await ffmpeg.makeBlank(speed, durationStr, blankFile, compute);
    } else {
      console.log(`Start buffer ${blankFile} exists...moving on...`);
    }

    // Add to the top of the list of files to combine
    mergeFiles.push(blankFile);
  }

  // Reformat the FPS of existing files and make the blank files between videos to align to
  // real time if the cameras were off for a time
  for (const file of Object.keys(data)) {
    if (file.includes('_blank.MP4')) {
      let duration = data[file].duration;
      duration = utils.reduceLength(duration);
      const durationStr = utils.getDurStr(utils.makeSeconds(duration));
      console.log(`    making blank file ${durationStr} long...`);
      if (!fs.existsSync(file)) {
        await ffmpeg.makeBlank(speed, durationStr, file, compute);
      } else {
        console.log(`Blank file ${file} exists...Moving on...`);
      }

      // Add the blank file to the file list
      mergeFiles.push(file);
    } else if (!['concat_start', 'concat_duration', 'fps'].includes(file)) {
      const fileLength = file.split('/').length;
      const newFile = `${file.split('/')[fileLength - 1].split('.MP4')[0]}_newfps.MP4`;
      if (!fs.existsSync(`${destPath}/${camera}/${newFile}`)) {
        await ffmpeg.changeFPS(file, speed, `${destPath}/${camera}/${newFile}`, compute);
      } else {
        console.log(`New FPS ${file} exists...Moving on...`);
      }

      // Add the new fps file to the file list
      mergeFiles.push(`${destPath}/${camera}/${newFile}`);
    }
  }

  // Make a stop buffer if necessary
  if (cameraData[camera].stop_buffer > 0.0) {
    const blankFile = `${destPath}/${camera}/StopBuffer.MP4`;
    const durationStr = utils.getDurStr(utils.makeSeconds(cameraData[camera].stop_buffer));
    console.log(`Stop Buffer for ${camera}: ${durationStr}`);
    if (!fs.existsSync(blankFile)) {
      await ffmpeg.makeBlank(speed, durationStr, blankFile, compute);
    } else {
      console.log(`Stop Buffer ${blankFile} already exists...Moving on...`);
    }

    // Add to the end of the list of files to combine
    mergeFiles.push(blankFile);
  }

  // Merge the camera files
  // Save the file list to a txt file for the ffmpeg command to read in easily
  const txtFile = `${destPath}/${camera}/merge_array.txt`;
  let fileNames = '';
  mergeFiles.forEach((fileName) => {
    fileNames += `file '${fileName}'\n`;
  });
  console.log('Merging:');
  console.log(fileNames);
  writeFileSync(txtFile, fileNames);
  if (!fs.existsSync(`${destPath}/${camera}/concat.MP4`)) {
    await ffmpeg.combineCamera(txtFile, `${destPath}/${camera}/concat.MP4`, compute);
  } else {
    console.log(`Camera concat ${destPath}/${camera}/concat.MP4 exists...moving on...`);
  }

  // Remove anything with *Buffer.MP4 or *_blank.MP4 or *_newfps.MP4 - supporting files
  if (allFiles === false) {
    utils.removeFiles(`${destPath}/${camera}/*_blank.MP4`);
    utils.removeFiles(`${destPath}/${camera}/*Buffer.MP4`);
    utils.removeFiles(`${destPath}/${camera}/*_newfps.MP4`);
    utils.removeFiles(`${destPath}/${camera}/merge_array.txt`);
  }
}

// Puts the individual camera videos side by side for the final syncd video
async function mergeCameras(cameras, destPath, rotations, compute, allFiles) {
  const mergeFiles = [];

  for (const camera of cameras) {
    // Perform any video rotations that were specified in the command line arguments
    if (Object.keys(rotations).includes(camera)) {
      if (!fs.existsSync(`${destPath}/${camera}/concat_rotated.MP4`)) {
        await ffmpeg.rotate(`${destPath}/${camera}/concat.MP4`, rotations[camera], `${destPath}/${camera}/concat_rotated.MP4`, compute);
      } else {
        console.log(`Rotated file ${destPath}/${camera}/concat_rotated.MP4 exists...moving on...`);
      }

      // Add the rotated video to the file list
      mergeFiles.push(`${destPath}/${camera}/concat_rotated.MP4`);
    } else {
      // Add the original video to the file list
      mergeFiles.push(`${destPath}/${camera}/concat.MP4`);
    }
  }

  console.log(`Merging: ${mergeFiles}`);
  await ffmpeg.sideBySide(mergeFiles, `${destPath}/syncd_video.MP4`, cameras, compute);

  // Remove the supporting files and directories
  if (allFiles === false) {
    utils.removeFiles(`${destPath}/**/concat.MP4`);
    utils.removeFiles(`${destPath}/**/concat_rotated.MP4`);
    utils.removeFiles(`${destPath}/CameraTimings.json`);
    utils.removeFiles(`${destPath}/**/FileTimings.json`);
    utils.removeDirs(`${destPath}`, cameras);
  }
}

// Main sync function controls getting the timing for videos, combining single camera streams
// and putting the videos side by side
async function runSync(participant,
  dataPath,
  fileStructure,
  rotations,
  destPath,
  compute,
  allFiles) {
  try {
    // Get the individual cameras for a participant
    const cameras = Object.keys(fileStructure[participant]);

    // Synchronize each camera
    for (const camera of cameras) {
      console.log(`Running for camera: ${camera}`);
      // Get a correctly ordered list of files and get video timings
      const orderedVids = utils.orderGoProFiles(fileStructure[participant][camera]);

      // Get the timing for each MP4 file
      if (!fs.existsSync(`${destPath}/${participant}/${camera}/FileTimings.json`)) {
        await timing.fileTimings(orderedVids, `${dataPath}/${participant}/${camera}`, `${destPath}/${participant}/${camera}`);
      } else {
        console.log(`Already made timing file for ${participant}'s ${camera}...Skipping...`);
      }
    }

    // Get timings and fps for all videos
    timing.cameraTimings(cameras, `${destPath}/${participant}`);

    // Merge the camera files
    for (const camera of cameras) {
      await makeCameraVid(`${dataPath}/${participant}/${camera}`,
        `${destPath}/${participant}`, camera, compute, allFiles);
    }

    // Put the camera videos side by side in one syncd video
    await mergeCameras(cameras, `${destPath}/${participant}`, compute, allFiles);
  } catch (err) {
    console.log(err);
  }
}

// Make runSync accessible to app.js
module.exports = {
  runSync,
};
