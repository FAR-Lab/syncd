/* eslint-disable camelcase */
/* eslint-disable no-await-in-loop */
/* eslint-disable eqeqeq */
/* eslint-disable spaced-comment */
/* eslint-disable prefer-destructuring */
/* eslint-disable no-console */
/* eslint-disable func-names */
/* eslint-disable prefer-arrow-callback */
/* eslint-disable no-restricted-syntax */
// Import packages
const {
  writeFileSync, promises,
} = require('fs');
const ffmpeg = require('fluent-ffmpeg'); // https://www.npmjs.com/package/fluent-ffmpeg
const utils = require('./utils');

// Get all of the files in the filepath with `GOPR` in the name and process each
async function run(participantInd, camera) {
  const currPath = process.cwd();
  const data = JSON.parse(await promises.readFile(`./p${participantInd}/${camera}FileTimings.json`, 'utf8'));
  const camera_data = JSON.parse(await promises.readFile(`${currPath}/p${participantInd}/CameraTimings.json`, 'utf8'));
  const speed = camera_data.fps;

  const mergeFiles = [];

  for (const file of Object.keys(data)) {
    if (!(['concat_start', 'concat_duration', 'fps'].includes(file))) {
      console.log(`Running for ${file}...`);

      if (file.includes('_blank.mp4')) {
        let duration = data[file].duration;
        duration = utils.reduceLength(duration);
        const durationStr = utils.getDurStr(utils.makeSeconds(duration));
        console.log(`    making blank file ${durationStr} long...`);
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve, reject) => {
          ffmpeg(`color=size=1920x1080:rate=${speed}:color=black`).inputFormat('lavfi').input('anullsrc=channel_layout=stereo:sample_rate=48000').inputFormat('lavfi')
            .inputOptions(['-hwaccel cuda', '-vsync 0', '-hwaccel_output_format cuda'])
            .outputOptions([durationStr, '-c:v h264_nvenc'])
            .on('error', function (err) {
              console.log(err);
              reject(err);
            })
            .on('end', function () {
              console.log('finished running blank between same camera videos');
              resolve();
            })
            .save(file)
            .run();
        });
        mergeFiles.push(file);
      } else {
        const fileLength = file.split('/').length;
        const new_file = `${file.split('/')[fileLength - 1].split('.MP4')[0]}_newfps.mp4`;
        await new Promise((resolve, reject) => {
          ffmpeg().input(file).complexFilter([`fps=${speed}`])
            .inputOptions(['-hwaccel cuda', '-vsync 0', '-hwaccel_output_format cuda'])
            .outputOptions(['-c:a copy', '-c:v h264_nvenc'])
            .on('error', function (err) {
              console.log(err);
              reject(err);
            })
            .on('end', function () {
              console.log('finished changing fps for video');
              resolve();
            })
            .save(`${currPath}/p${participantInd}/${new_file}`)
            .run();
        });
        mergeFiles.push(`${currPath}/p${participantInd}/${new_file}`);
      }
    }
  }

  // Merge the files together after writing the file array to a txt file
  // Adapted from https://github.com/fluent-ffmpeg/node-fluent-ffmpeg/issues/496
  const txtFile = `${currPath}/p${participantInd}/merge_array.txt`;
  let fileNames = '';
  await mergeFiles.forEach((fileName) => {
    fileNames += `file '${fileName}'\n`;
  });
  console.log('Merging:');
  console.log(fileNames);
  await writeFileSync(txtFile, fileNames);
  try {
    await new Promise((resolve, reject) => {
      ffmpeg().input(txtFile).inputOptions(['-f concat', '-safe 0']) //.complexFilter([`fps=${speed}`]) //.outputOptions(['-c copy']) // , '-vcodec libx265', '-crf 24'])
        .inputOptions(['-hwaccel cuda', '-vsync 0', '-hwaccel_output_format cuda'])
        .outputOptions(['-c:a copy', '-c:v h264_nvenc'])
        .on('error', function (err) {
          reject(err);
        })
        .on('end', function () {
          console.log('finished running merge for camera');
          resolve();
        })
        .save(`p${participantInd}/${camera}_concat.mp4`)
        .run();
    });
  } catch (err) {
    console.log(err);
  }
}

// Run the script
const args = process.argv.slice(2);
const participantID = args[0];
const camera = args[1];
run(participantID, camera);
