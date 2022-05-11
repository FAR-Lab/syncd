/* eslint-disable eqeqeq */
/* eslint-disable no-const-assign */
/* eslint-disable func-names */
/* eslint-disable prefer-arrow-callback */
/* eslint-disable max-len */
/* eslint-disable no-console */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */
// Import packages
const {
  promises, writeFileSync,
} = require('fs');
const glob = require('glob-promise');
const utils = require('./utils');

async function run(filePath, participantInd) {
  const currPath = process.cwd();
  const files = await glob(`${filePath}*/*.MP4`);
  const pathLen = filePath.split('/').length;

  // Make it easier to break up the data by organizing by camera
  const cameras = files.map((val) => val.split('/')[pathLen - 1].split('/')[0]);
  const uniqueCameras = cameras.filter(utils.onlyUnique);

  const removePoints = {};
  const timePoints = [];
  for (const camera of uniqueCameras) {
    const data = JSON.parse(await promises.readFile(`${currPath}/p${participantInd}/${camera}FileTimings.json`, 'utf8'));
    removePoints[camera] = {};
    for (const file of Object.keys(data)) {
      if (file.includes('_blank.mp4')) {
        timePoints.push([data[file].start_time, camera, file, 'start']);
        timePoints.push([data[file].start_time + data[file].duration, camera, file, 'end']);
        removePoints[camera][file] = 0;
      }
    }
  }

  timePoints.sort(function (a, b) { return a[0].toString().localeCompare(b[0].toString()); });

  const numTimePoints = timePoints.length;
  let ind = 0;

  for (const i of Array(numTimePoints - uniqueCameras.length).keys()) {
    if (ind >= uniqueCameras.length) {
      if ((timePoints[i][3] == 'start') && (timePoints[i + 1][3] == 'end') && (timePoints[i][1] != timePoints[i + 1][1])) {
        const reduce = timePoints[i + 1][0] - timePoints[i][0];
        for (const j of Array(uniqueCameras.length).keys()) { 
          removePoints[timePoints[i - j][1]][timePoints[i - j][2]] = reduce;
        }
      }
    }
    ind += 1;
  }

  console.log(removePoints);

  for (const camera of Object.keys(removePoints)) {
    const data = JSON.parse(await promises.readFile(`${currPath}/p${participantInd}/${camera}FileTimings.json`, 'utf8'));
    for (const file of Object.keys(removePoints[camera])) {
      data[file].duration -= removePoints[camera][file];
    }
    await writeFileSync(`./p${participantInd}/${camera}FileTimings.json`, JSON.stringify(data));
  }
}

// Run the script
const args = process.argv.slice(2);
const dataPath = args[0];
const participantID = args[1];
run(dataPath, participantID);
