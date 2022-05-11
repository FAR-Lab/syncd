/* eslint-disable eqeqeq */
/* eslint-disable spaced-comment */
/* eslint-disable func-names */
/* eslint-disable no-console */
/* eslint-disable prefer-arrow-callback */
/* eslint-disable no-loop-func */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */
const {
  writeFileSync, promises,
} = require('fs');
const ffmpeg = require('fluent-ffmpeg'); // https://www.npmjs.com/package/fluent-ffmpeg
const utils = require('./utils');

async function run(participantInd, camera) {
  const currPath = process.cwd();
  const data = JSON.parse(await promises.readFile(`${currPath}/p${participantInd}/CameraTimings.json`, 'utf8'));

  const mergeFiles = [];
  const speed = data.fps;

  if (data[camera].start_buffer > 0.0) {
    const blankFile = `${currPath}/p${participantInd}/${camera}StartBuffer.mp4`;
    mergeFiles.push(blankFile);

    const durationStr = utils.getDurStr(utils.makeSeconds(data[camera].start_buffer));
    console.log(`Start Buffer for ${camera}: ${durationStr}`);

    await new Promise((resolve, reject) => {
      ffmpeg(`color=size=1920x1080:rate=${speed}:color=black`).inputFormat('lavfi').input('anullsrc=channel_layout=stereo:sample_rate=48000').inputFormat('lavfi')
        .inputOptions(['-hwaccel cuda', '-vsync 0', '-hwaccel_output_format cuda'])
        .outputOptions([durationStr, '-c:v h264_nvenc'])
        .on('error', function (err) {
          reject(err);
        })
        .on('end', function () {
          console.log('finished running blank at start of camera');
          resolve();
        })
        .save(blankFile)
        .run();
    });
  }

  mergeFiles.push(`${currPath}/p${participantInd}/${camera}_concat.mp4`);

  if (data[camera].stop_buffer > 0.0) {
    const blankFile = `${currPath}/p${participantInd}/${camera}StopBuffer.mp4`;
    mergeFiles.push(blankFile);

    const durationStr = utils.getDurStr(utils.makeSeconds(data[camera].stop_buffer));
    console.log(`Stop Buffer for ${camera}: ${durationStr}`);
    await new Promise((resolve, reject) => {
      ffmpeg(`color=size=1920x1080:rate=${speed}:color=black`).inputFormat('lavfi').input('anullsrc=channel_layout=stereo:sample_rate=48000').inputFormat('lavfi')
        .inputOptions(['-hwaccel cuda', '-vsync 0', '-hwaccel_output_format cuda'])
        .outputOptions([durationStr, '-c:v h264_nvenc'])
        .on('error', function (err) {
          reject(err);
        })
        .on('end', function () {
          console.log('finished running blank at end of camera');
          resolve();
        })
        .save(blankFile)
        .run();
    });
  }

  const txtFile = `${currPath}/p${participantInd}/merge_array.txt`;
  let fileNames = '';
  mergeFiles.forEach((fileName) => {
    fileNames += `file '${fileName}'\n`;
  });
  console.log(`Merging ${mergeFiles}`);
  console.log('filenames');
  await writeFileSync(txtFile, fileNames);
  const saveFile = `${currPath}/p${participantInd}/final_${camera}_concat.mp4`;
  await new Promise((resolve, reject) => {
    ffmpeg().input(txtFile).inputOptions(['-f concat', '-safe 0', '-hwaccel cuda', '-vsync 0', '-hwaccel_output_format cuda']).complexFilter([`fps=${speed}`]) // .outputOptions(['-c:a copy', '-c:v h264', '-preset superfast'])
      .outputOptions(['-c:v h264_nvenc'])
      .on('error', function (err) {
        reject(err);
      })
      .on('end', function () {
        console.log('finished running combining camera buffers');
        resolve();
      })
      .save(saveFile)
      .run();
  });
}

// Run the script
const args = process.argv.slice(2);
const participantID = args[0];
const camera = args[1];
run(participantID, camera);
