/* eslint-disable no-console */
/* eslint-disable prefer-destructuring */
/* eslint-disable no-restricted-syntax */
const {
  readFile, writeFile,
} = require('fs');
const utils = require('./utils');
const timing = require('./timings');
const ffmpeg = require('./ffmpegCmds');

function makeCameraVid(dataPath, destPath, compute, allFiles, camera) {
  // Pull the timing data and high level camera info in
  const data = JSON.parse(readFile(`${destPath}/${camera}/FileTimings.json`, 'utf8'));
  const cameraData = JSON.parse(readFile(`${destPath}/CameraTimings.json`));
  const speed = cameraData.fps;
  const mergeFiles = [];

  // Make a start buffer if necessary
  if (cameraData[camera].start_buffer > 0.0) {
    const blankFile = `${destPath}/${camera}/StartBuffer.MP4`;
    const durationStr = utils.getDurStr(utils.makeSeconds(cameraData[camera].start_buffer));
    console.log(`Start Buffer for ${camera}: ${durationStr}`);
    ffmpeg.makeBlank(speed, durationStr, blankFile, compute);
    mergeFiles.push(blankFile);
  }

  // Reformat the FPS of existing files and make the blank files
  for (const file of Object.keys(data)) {
    if (file.includes('_blank.MP4')) {
      let duration = data[file].duration;
      duration = utils.reduceLength(duration);
      const durationStr = utils.getDurStr(utils.makeSeconds(duration));
      console.log(`    making blank file ${durationStr} long...`);
      ffmpeg.makeBlank(speed, durationStr, file, compute);
      mergeFiles.push(file);
    } else {
      const fileLength = file.split('/').length;
      const newFile = `${file.split('/')[fileLength - 1].split('.MP4')[0]}_newfps.MP4`;
      ffmpeg.changeFPS(file, speed, `${destPath}/${camera}/${newFile}`, compute);
      mergeFiles.push(`${destPath}/${camera}/${newFile}`);
    }
  }

  // Make a stop buffer if necessary
  if (cameraData[camera].stop_buffer > 0.0) {
    const blankFile = `${destPath}/${camera}/StopBuffer.MP4`;
    const durationStr = utils.getDurStr(utils.makeSeconds(cameraData[camera].stop_buffer));
    console.log(`Stop Buffer for ${camera}: ${durationStr}`);
    ffmpeg.makeBlank(speed, durationStr, blankFile, compute);
    mergeFiles.push(blankFile);
  }

  // Merge the camera files
  const txtFile = `${destPath}/${camera}/merge_array.txt`;
  let fileNames = '';
  mergeFiles.forEach((fileName) => {
    fileNames += `file '${fileName}'\n`;
  });
  console.log('Merging:');
  console.log(fileNames);
  writeFile(txtFile, fileNames);
  ffmpeg.combineCamera(txtFile, `${destPath}/${camera}/concat.MP4`, compute);

  // Remove anything with *Buffer.MP4 or *_blank.MP4 or *_newfps.MP4
  if (!allFiles) {
    utils.removeFiles(`${destPath}/${camera}/*_blank.MP4`);
    utils.removeFiles(`${destPath}/${camera}/*Buffer.MP4`);
    utils.removeFiles(`${destPath}/${camera}/*_newfps.MP4`);
    utils.removeFiles(`${destPath}/${camera}/merge_array.txt`);
  }
}

function mergeCameras(cameras, destPath, rotations, compute, allFiles) {
  const mergeFiles = [];

  cameras.forEach((camera) => {
    if (Object.keys(rotations).includes(camera)) {
      ffmpeg.rotate(`${destPath}/${camera}/concat.MP4`, rotations[camera], `${destPath}/${camera}/concat_rotated.MP4`, compute);
      mergeFiles.push(`${destPath}/${camera}/concat_rotated.MP4`);
    } else {
      mergeFiles.push(`${destPath}/${camera}/concat.MP4`);
    }
  });

  console.log(`Merging: ${mergeFiles}`);
  ffmpeg.sideBySide(mergeFiles, `${destPath}/syncd_video.MP4`, cameras, compute);

  if (!allFiles) {
    utils.removeFiles(`${destPath}/**/concat.MP4`);
    utils.removeFiles(`${destPath}/**/concat_rotated.MP4`);
    utils.removeFiles(`${destPath}/CameraTimings.json`);
    utils.removeFiles(`${destPath}/**/FileTimings.json`);
    utils.removeDirs(`${destPath}`, cameras);
  }
}

async function runSync(participant,
  dataPath,
  fileStructure,
  rotations,
  destPath,
  compute,
  allFiles) {
  // Get the individual cameras for a participant
  const cameras = Object.keys(fileStructure[participant]);

  // Synchronize each camera
  await cameras.forEach((camera) => {
    // Get a correctly ordered list of files and get video timings
    const orderedVids = utils.orderGoProFiles(fileStructure[participant][camera]);

    // Get the timing for each MP4 file
    timing.fileTimings(orderedVids, `${dataPath}/${participant}/${camera}`, `${destPath}/${participant}/${camera}`);
  });

  // Get timings and fps for all videos
  await timing.cameraTimings(cameras, `${destPath}/${participant}`);

  // Merge the camera files
  await cameras.forEach((camera) => {
    makeCameraVid(`${dataPath}/${participant}/${camera}`,
      `${destPath}/${participant}`, camera, compute, allFiles);
  });

  // Merge the cameras
  await mergeCameras(cameras, `${destPath}/${participant}`, compute, allFiles);
}

module.exports = {
  runSync,
};
