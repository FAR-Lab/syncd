/* eslint-disable no-console */
/* eslint-disable no-param-reassign */
/* eslint-disable max-len */
/* eslint-disable func-names */
const gpmfExtract = require('gpmf-extract'); // https://github.com/JuanIrache/gpmf-extract
const goproTelemetry = require('gopro-telemetry'); // https://github.com/JuanIrache/gopro-telemetry
const {
  createReadStream,
  writeFileSync,
} = require('fs');
const luxon = require('luxon');

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

function getDurStr(timeDiff) {
  const hours = Math.floor(timeDiff / 3600);
  const minutes = Math.floor((timeDiff - (hours * 3600)) / 60);
  const seconds = timeDiff - (minutes * 60) - (hours * 3600);
  return `-t ${hours}:${minutes}:${seconds}`;
}

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

module.exports = {
  getDurStr,
  onlyUnique,
  processVid,
  bufferAppender,
  reduceLength,
  makeSeconds,
};
