/* eslint-disable max-len */
/* eslint-disable no-console */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */
// Import packages
const {
  writeFileSync, promises,
} = require('fs');
const glob = require('glob-promise');
const utils = require('./utils');

// Get all of the files in the filepath with `GOPR` in the name and process each
async function run(filePath, participantInd) {
  const currPath = process.cwd();
  const files = await glob(`${filePath}*/*.MP4`);
  const pathLen = filePath.split('/').length;

  // Make it easier to break up the data by organizing by camera
  const cameras = files.map((val) => val.split('/')[pathLen - 1].split('/')[0]);
  const uniqueCameras = cameras.filter(utils.onlyUnique);

  const timingData = {};
  timingData.vid_start = Infinity;
  timingData.fps = Infinity;
  timingData.vid_stop = 0;
  for (const camera of uniqueCameras) {
    const data = JSON.parse(await promises.readFile(`${currPath}/p${participantInd}/${camera}FileTimings.json`, 'utf8'));

    timingData[camera] = {};
    timingData[camera].camera_start = data.concat_start;
    timingData[camera].camera_dur = data.concat_duration;
    timingData[camera].camera_stop = data.concat_start + data.concat_duration;
    timingData.vid_start = Math.min(data.concat_start, timingData.vid_start);
    timingData.vid_stop = Math.max(data.concat_duration + data.concat_start, timingData.vid_stop);
    timingData.fps = Math.min(timingData.fps, data.fps);
  }

  for (const camera of uniqueCameras) {
    timingData[camera].start_buffer = timingData[camera].camera_start - timingData.vid_start;
    timingData[camera].stop_buffer = timingData.vid_stop - timingData[camera].camera_stop;
  }

  // Put the data into a txt file
  let saveTxt = '';
  saveTxt += `Global Start: ${new Date(timingData.vid_start)}\n`;
  saveTxt += `Global End: ${new Date(timingData.vid_stop)}\n`;
  saveTxt += '-------------------------------------\n';
  saveTxt += 'Filename                                             Start Time                         Start Buffer                         Duration                          End Time                          End Buffer\n';
  for (const camera of Object.keys(timingData)) {
    if (!(['vid_start', 'vid_stop', 'fps'].includes(camera))) {
      saveTxt += `${camera}                                     ${new Date(timingData[camera].camera_start).toISOString()}              ${utils.getDurStr(utils.makeSeconds(timingData[camera].start_buffer))}                       ${utils.getDurStr(utils.makeSeconds(timingData[camera].camera_dur))}                      ${new Date(timingData[camera].camera_stop).toISOString()}              ${utils.getDurStr(utils.makeSeconds(timingData[camera].stop_buffer))}\n`;
    }
  }
  await writeFileSync(`${currPath}/p${participantInd}/CameraTimings.txt`, saveTxt);
  await writeFileSync(`${currPath}/p${participantInd}/CameraTimings.json`, JSON.stringify(timingData));
}

// Run the script
const args = process.argv.slice(2);
const dataPath = args[0];
const participantID = args[1];
run(dataPath, participantID);
