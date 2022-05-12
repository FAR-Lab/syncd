/* eslint-disable prefer-arrow-callback */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-console */
/* eslint-disable no-param-reassign */
/* eslint-disable max-len */
/* eslint-disable func-names */
const gpmfExtract = require('gpmf-extract'); // https://github.com/JuanIrache/gpmf-extract
const goproTelemetry = require('gopro-telemetry'); // https://github.com/JuanIrache/gopro-telemetry
const {
  createReadStream,
  writeFileSync,
  rmdir,
  unlinkSync,
} = require('fs');
const luxon = require('luxon');
const glob = require('glob-promise');

// Handle bug in gpmf-extract for large video files
// Read more about this here: https://github.com/JuanIrache/gpmf-extract
function bufferAppender(path, chunkSize) {
  return function (mp4boxFile) {
    const stream = createReadStream(path, { highWaterMark: chunkSize });
    let bytesRead = 0;
    stream.on('end', () => {
      mp4boxFile.flush();
    });
    stream.on('data', (chunk) => {
      const arrayBuffer = new Uint8Array(chunk).buffer;
      arrayBuffer.fileStart = bytesRead;
      mp4boxFile.appendBuffer(arrayBuffer);
      bytesRead += chunk.length;
    });
    stream.resume();
  };
}

// Convert an int for time to string for ffmpeg commands
function getDurStr(timeDiff) {
  const hours = Math.floor(timeDiff / 3600);
  const minutes = Math.floor((timeDiff - (hours * 3600)) / 60);
  const seconds = timeDiff - (minutes * 60) - (hours * 3600);
  return `-t ${hours}:${minutes}:${seconds}`;
}

// Make sure things are in the right time
async function adjustTimestamps(data) {
  const startTime = luxon.DateTime.fromISO(data[Object.keys(data).length - 1].date.toISOString()).minus(data[Object.keys(data).length - 1].cts);
  const adjusted = data.map((sample) => {
    sample.date = startTime.plus(sample.cts).toUTC().toString();
    return sample;
  });
  return adjusted;
}

// borrowed from https://stackoverflow.com/questions/1960473/get-all-unique-values-in-a-javascript-array-remove-duplicates
function onlyUnique(value, index, self) {
  return self.indexOf(value) === index;
}

async function processVid(vidPath, savePath) {
  const fileData = await gpmfExtract(bufferAppender(vidPath, 10 * 1024 * 1024));
  const duration = fileData.timing.videoDuration;
  const frameDur = fileData.timing.frameDuration;
  const telemetry = await goproTelemetry(fileData);

  // this heuristic isn't perfect and might want to be refined
  telemetry['1'].streams.GPS5.samples = await adjustTimestamps(telemetry['1'].streams.GPS5.samples);
  await writeFileSync(`${savePath}/${vidPath.split('/')[vidPath.split('/').length - 1].split('.MP4')[0]}.json`, JSON.stringify(telemetry));

  return [new Date(telemetry['1'].streams.GPS5.samples[0].date).getTime(), duration * 1000, frameDur];
}

function reduceLength(duration) {
  while (duration > 4000000) {
    duration -= 3600000;
  }
  return duration;
}

function makeSeconds(timeObj) {
  return timeObj / 1000;
}

async function getFileStructure(dataPath) {
  const files = await glob(`${dataPath}/**/**/*.MP4`);
  const fileStructure = {};
  files.forEach((fileName) => {
    const subgroup = fileName.split(dataPath)[1].split('/');
    const participant = subgroup[1];
    if (!Object.keys(fileStructure).includes(participant)) {
      fileStructure[participant] = {};
    }
    const camera = subgroup[2];
    if (!Object.keys(fileStructure[participant]).includes(camera)) {
      fileStructure[participant][camera] = [];
    }
    const file = subgroup[3];
    fileStructure[participant][camera].push(file);
  });
  return fileStructure;
}

function readParams() {
  // Get the path where the data is located (required)
  const dataPath = process.argv.slice(2)[0];

  // Check if any rotations are specified
  const rotationIndex = process.argv.indexOf('--rotate');
  let rotations;

  if (rotationIndex > -1) {
    rotations = JSON.parse(process.argv[rotationIndex + 1].toString());
  } else {
    rotations = {};
  }

  // Check if the destination is specified for package outputs
  const destIndex = process.argv.indexOf('--destination');
  let destPath;
  const currPath = process.cwd();

  if (destIndex > -1) {
    destPath = process.argv[destIndex + 1];
  } else {
    destPath = `${currPath}/syncd_output`;
  }

  // Check if the type of compute is specified
  const computeIndex = process.argv.indexOf('--compute');
  let compute;

  if (computeIndex > -1) {
    compute = process.argv[computeIndex + 1];
  } else {
    compute = 'cpu';
  }

  // Check if user wants all files or just the final merge
  const allFilesIndex = process.argv.indexOf('--all-files');
  let allFiles;

  if (allFilesIndex > -1) {
    allFiles = true;
  } else {
    allFiles = false;
  }

  return [dataPath, rotations, destPath, compute, allFiles];
}

function orderGoProFiles(vids) {
  let fileOrder = [];
  const goprVids = vids.filter(function (str) { return str.includes('GOPR'); });
  let goprIDs = goprVids.map((vid) => parseFloat(vid.split('GOPR')[1].split('.MP4')[0]));
  goprIDs = goprIDs.map(function (gopr) {
    if (gopr < 10) {
      gopr = `000${gopr}`;
    } else if (gopr < 100) {
      gopr = `00${gopr}`;
    } else if (gopr < 1000) {
      gopr = `0${gopr}`;
    } return gopr;
  });
  goprIDs.sort();

  for (const gopr of goprIDs) {
    fileOrder.push(`GOPR${gopr}.MP4`);

    const gpVids = vids.filter(function (str) { return str.includes(`${gopr}.MP4`) && str.includes('GP'); });
    let gpIDs = gpVids.map((vid) => parseFloat(vid.split('GP')[1].split(`${gopr}.MP4`)[0]));
    gpIDs.sort();
    gpIDs = gpIDs.map(function (gp) { if (gp < 10) { gp = `0${gp}`; } return gp; });
    gpIDs = gpIDs.map((gp) => `GP${gp}${gopr}.MP4`);

    fileOrder = [...fileOrder, ...gpIDs];
  }

  return fileOrder;
}

function removeFiles(pattern) {
  const files = glob(pattern);
  files.forEach((file) => {
    unlinkSync(file);
    console.log(`Deleted file: ${file}`);
  });
}

function removeDirs(dest, dirs) {
  dirs.forEach((dir) => {
    rmdir(dir, { recursive: true }, (err) => {
      if (err) {
        console.log(err);
      }
      console.log(`Deleted directory: ${dir}`);
    });
  });
}

module.exports = {
  getDurStr,
  onlyUnique,
  processVid,
  bufferAppender,
  reduceLength,
  makeSeconds,
  getFileStructure,
  readParams,
  orderGoProFiles,
  removeFiles,
  removeDirs,
};
