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
  rmdir,
  unlinkSync,
} = require('fs'); // File system module makes life easy peasy
const luxon = require('luxon'); // Enables easier datetime manipulation
const glob = require('glob-promise'); // Allows easier file system parsing

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
// Video length in ms becomes string of format HH:MM:SS
function getDurStr(timeDiff) {
  const hours = Math.floor(timeDiff / 3600);
  const minutes = Math.floor((timeDiff - (hours * 3600)) / 60);
  const seconds = timeDiff - (minutes * 60) - (hours * 3600);
  return `-t ${hours}:${minutes}:${seconds}`;
}

// Adjust the timestamps based on when real data actually appears (the camera actually starts recording)
function adjustTimestamps(data) {
  const startTime = luxon.DateTime.fromISO(data[Object.keys(data).length - 1].date.toISOString()).minus(data[Object.keys(data).length - 1].cts);
  const adjusted = data.map((sample) => {
    sample.date = startTime.plus(sample.cts).toUTC().toString();
    return sample;
  });
  return adjusted;
}

// borrowed from https://stackoverflow.com/questions/1960473/get-all-unique-values-in-a-javascript-array-remove-duplicates
// Get unique values from a list
function onlyUnique(value, index, self) {
  return self.indexOf(value) === index;
}

// Function for pulling the timestamps from a video from the underlying GPS metadata
async function processVid(vidPath) {
  try {
    // Returns the timestamps and other video metadata extracted from GPS
    const fileData = await gpmfExtract(bufferAppender(vidPath, 10 * 1024 * 1024));
    const duration = fileData.timing.videoDuration;
    const frameDur = fileData.timing.frameDuration;
    const telemetry = await goproTelemetry(fileData);

    // This heuristic isn't perfect and might want to be refined - calls the adjustment to time
    // to be when data first appears in the files (when the camera starts recording)
    telemetry['1'].streams.GPS5.samples = adjustTimestamps(telemetry['1'].streams.GPS5.samples);

    // Return the timing data for the video
    return [new Date(telemetry['1'].streams.GPS5.samples[0].date).getTime(), duration * 1000, frameDur];
  } catch (err) {
    console.log(err);
  }
  return ['This should never happen'];
}

// If the cameras are off for long periods in the middle of the recordings, reduce the
// size of the blank files to be more reasonable (no longer than a minute longer than
// the time necessary to properly sync across cameras)
function reduceLength(duration) {
  while (duration > 4000000) {
    duration -= 3600000;
  }
  return duration;
}

// Turn ms to seconds for consistency across the syncd module in how everything is calculated
function makeSeconds(timeObj) {
  return timeObj / 1000;
}

// Get the structure of participants, cameras, and the actual MP4 files
function getFileStructure(dataPath) {
  const files = glob.sync(`${dataPath}/**/**/*.MP4`);
  const fileStructure = {};
  files.forEach((fileName) => {
    // Separate the file path so that the participant name and camera name can be read
    const subgroup = fileName.split(dataPath)[1].split('/');
    const participant = subgroup[1];

    // Add the participant info to the fileStructure dict
    if (!Object.keys(fileStructure).includes(participant)) {
      fileStructure[participant] = {};
    }

    // Add the camera info to the fileStructure dict
    const camera = subgroup[2];
    if (!Object.keys(fileStructure[participant]).includes(camera)) {
      fileStructure[participant][camera] = [];
    }

    // Add the file itself to the fileStructure dict
    const file = subgroup[3];
    fileStructure[participant][camera].push(file);
  });
  return fileStructure;
}

// Parse the command line arguments and set default values for optional arguments
function readParams() {
  // Get the path where the data is located (required)
  const dataPath = process.argv.slice(2)[0];

  // Check if any rotations are specified
  const rotationIndex = process.argv.indexOf('--rotate');
  let rotations;

  if (rotationIndex > -1) {
    rotations = JSON.parse(process.argv[rotationIndex + 1].toString());
  } else {
    // Default to no rotations
    rotations = {};
  }

  // Check if the destination is specified for package outputs
  const destIndex = process.argv.indexOf('--destination');
  let destPath;
  const currPath = process.cwd();

  if (destIndex > -1) {
    destPath = process.argv[destIndex + 1];
  } else {
    // Default to the current working directory in a new directory called "syncd_output"
    destPath = `${currPath}/syncd_output`;
  }

  // Check if the type of compute is specified
  const computeIndex = process.argv.indexOf('--compute');
  let compute;

  if (computeIndex > -1) {
    compute = process.argv[computeIndex + 1];
  } else {
    // Default to CPU
    compute = 'cpu';
  }

  // Check if user wants all files or just the final merge
  const allFilesIndex = process.argv.indexOf('--all-files');
  let allFiles;

  if (allFilesIndex > -1) {
    allFiles = true;
  } else {
    // Default to deleting supporting files
    allFiles = false;
  }

  return [dataPath, rotations, destPath, compute, allFiles];
}

// Order the GoPro files based on standard GoPro filename syntax
function orderGoProFiles(vids) {
  let fileOrder = [];
  const goprVids = vids.filter(function (str) { return str.includes('GOPR'); });

  // Get the recording ID
  let goprIDs = goprVids.map((vid) => parseFloat(vid.split('GOPR')[1].split('.MP4')[0]));

  // If the recording ID is a small number, add leading zeros to maintain
  // filename syntax and to make string sorting accurate
  goprIDs = goprIDs.map(function (gopr) {
    if (gopr < 10) {
      gopr = `000${gopr}`;
    } else if (gopr < 100) {
      gopr = `00${gopr}`;
    } else if (gopr < 1000) {
      gopr = `0${gopr}`;
    } return gopr;
  });

  // Sort the IDs for the GOPR files
  goprIDs.sort();

  // For each GOPR file, find the GP following files for the GOPR recording ID
  // and sort these, as well
  for (const gopr of goprIDs) {
    // Add the GOPR file to the file list so it is before the GP files
    fileOrder.push(`GOPR${gopr}.MP4`);

    // Sort the GP files by index, adding a leading zero if necessary
    const gpVids = vids.filter(function (str) { return str.includes(`${gopr}.MP4`) && str.includes('GP'); });
    let gpIDs = gpVids.map((vid) => parseFloat(vid.split('GP')[1].split(`${gopr}.MP4`)[0]));
    gpIDs.sort();
    gpIDs = gpIDs.map(function (gp) { if (gp < 10) { gp = `0${gp}`; } return gp; });
    gpIDs = gpIDs.map((gp) => `GP${gp}${gopr}.MP4`);

    // Add the GP files to the list of files
    fileOrder = [...fileOrder, ...gpIDs];
  }

  return fileOrder;
}

// Delete supporting files based on the provided filename/file structure pattern
function removeFiles(pattern) {
  const files = glob.sync(pattern);
  files.forEach((file) => {
    unlinkSync(file);
    console.log(`Deleted file: ${file}`);
  });
}

// Delete unnecessary directories after cameras have been processed and the camera
// videos have been placed side by side
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

// Export the functions so they can be referenced by other files
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
