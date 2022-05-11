/* eslint-disable no-unused-vars */
/* eslint-disable import/no-unresolved */
/* eslint-disable no-console */
/* eslint-disable prefer-arrow-callback */
/* eslint-disable func-names */
/* eslint-disable no-loop-func */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */
const {
  writeFileSync, promises,
} = require('fs');
const ffmpeg = require('fluent-ffmpeg'); // https://www.npmjs.com/package/fluent-ffmpeg

async function run(participantInd, rotations) {
  const mergeFiles = [];
  const currPath = process.cwd();
  const data = JSON.parse(await promises.readFile(`./p${participantInd}/CameraTimings.json`, 'utf8'));

  console.log(Object.keys(rotations));

  for (const camera of Object.keys(data)) {
    if (!(['vid_start', 'vid_stop', 'fps'].includes(camera))) {
      if (Object.keys(rotations).includes(camera)) {
        /* await new Promise((resolve, reject) => {
          ffmpeg().input(`${currPath}/p${participantInd}/final_${camera}_concat.mp4`).withVideoFilter([`transpose=${rotations[camera]}`])
            .inputOptions(['-vsync 0', '-hwaccel_output_format cuda'])
            .outputOptions(['-c:v h264_nvenc'])
            .on('error', function (err) {
              reject(err);
            })
            .on('end', function () {
              console.log('rotated');
              resolve();
            })
            .save(`${currPath}/p${participantInd}/final_${camera}_rot_concat.mp4`)
            .run();
        }); */
        mergeFiles.push(`${currPath}/p${participantInd}/final_${camera}_rot_concat.mp4`);
      } else {
        mergeFiles.push(`${currPath}/p${participantInd}/final_${camera}_concat.mp4`);
      }
    }
  }

  // TODO: MAKE THIS AN ACTUAL FUNCTION BASED ON NUMBER OF VIDEO STREAMS
  // Put the videos from each camera side-by-side
  // Sound mix from https://stackoverflow.com/questions/44712868/ffmpeg-set-volume-in-amix
  // Adapted from https://stackoverflow.com/questions/38234357/node-js-ffmpeg-display-two-videos-next-to-each-other
  /* const txtFile = `${currPath}/p${participantInd}/merge_array.txt`;
  let fileNames = '';
  mergeFiles.forEach(function (fileName) {
    fileNames += `file '${fileName}'\n`;
  });
  console.log(`Merging: ${mergeFiles}`);
  await writeFileSync(txtFile, fileNames); */
  if (mergeFiles.length === 2) {
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(mergeFiles[0])
        .input(mergeFiles[1])
        .inputOptions(['-vsync 0', '-hwaccel_output_format cuda'])
        .complexFilter([
          '[0:v]scale=300:300[0scaled]',
          '[1:v]scale=300:300[1scaled]',
          '[0scaled]pad=600:300[0padded]',
          '[0padded][1scaled]overlay=repeatlast:x=300[output]',
          '[0:a][1:a]amix=inputs=2[a]',
        ])
        .outputOptions([
          '-map [output]', '-map [a]:a', '-c:v h264_nvenc',
        ])
        .on('error', function (er) {
          console.log(`error occurred: ${er.message}`);
          reject(er.message);
        })
        .on('end', function () {
          console.log('successful final merge');
          resolve();
        })
        .save(`${currPath}/p${participantInd}/full_view.mp4`)
        .run();
    });
  } else if (mergeFiles.length === 3) {
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(mergeFiles[0])
        .input(mergeFiles[1])
        .input(mergeFiles[2])
        .inputOptions(['-vsync 0', '-hwaccel_output_format cuda'])
        .complexFilter([
          '[0:v]scale=300:300[0scaled]',
          '[1:v]scale=300:300[1scaled]',
          '[2:v]scale=300:300[2scaled]',
          '[0scaled]pad=600:600[0padded]',
          '[0padded][1scaled]overlay=repeatlast:x=300[preoutput]',
          '[preoutput][2scaled]overlay=repeatlast:x=150:y=300[output]',
        ])
        .outputOptions([
          '-map [output]', '-map 0:a',
          '-map 1:a', '-map 2:a', '-c:v h264_nvenc',
          '-metadata:s:a:0 title="Driver"',
          '-metadata:s:a:1 title="Forward"',
          '-metadata:s:a:2 title="Navigator"',
          '-c:a copy',
        ])
        .on('error', function (er) {
          console.log(er);
          console.log(`error occurred: ${er.message}`);
          reject(er.message);
        })
        .on('end', function () {
          console.log('successful final merge');
          resolve();
        })
        .save(`${currPath}/p${participantInd}/full_view.mp4`)
        .run();
    });
  } else if (mergeFiles.length === 4) {
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(mergeFiles[0])
        .input(mergeFiles[1])
        .input(mergeFiles[2])
        .input(mergeFiles[3])
        .inputOptions(['-vsync 0', '-hwaccel_output_format cuda'])
        .complexFilter([
          '[0:v]scale=300:300[0scaled]',
          '[1:v]scale=300:300[1scaled]',
          '[2:v]scale=300:300[2scaled]',
          '[3:v]scale=300:300[3scaled]',
          '[0scaled]pad=600:600[0padded]',
          '[0padded][1scaled]overlay=repeatlast:x=300[preoutput]',
          '[preoutput][2scaled]overlay=repeatlast:y=300[preoutput]',
          '[preoutput][3scaled]overlay=repeatlast:x=300:y=300[output]',
          '[0:a][1:a][2:a][3:a]amix=inputs=4[a]',
        ])
        .outputOptions([
          '-map [output]', '-map [a]:a', '-c:v h264_nvenc',
        ])
        .on('error', function (er) {
          console.log(`error occurred: ${er.message}`);
          reject(er.message);
        })
        .on('end', function () {
          console.log('successful final merge');
          resolve();
        })
        .save(`${currPath}/p${participantInd}/full_view.mp4`)
        .run();
    });
  } else {
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(mergeFiles[0])
        .input(mergeFiles[1])
        .input(mergeFiles[2])
        .input(mergeFiles[3])
        .input(mergeFiles[4])
        .inputOptions(['-vsync 0', '-hwaccel_output_format cuda'])
        .complexFilter([
          '[0:v]scale=300:300[0scaled]',
          '[1:v]scale=300:300[1scaled]',
          '[2:v]scale=300:300[2scaled]',
          '[3:v]scale=300:300[3scaled]',
          '[4:v]scale=300:300[4scaled]',
          '[0scaled]pad=900:600[0padded]',
          '[0padded][1scaled]hwupload,overlay_cuda=repeatlast:x=300,hwdownload[preoutput]',
          '[preoutput][2scaled]overlay=repeatlast:x=600[preoutput]',
          '[preoutput][3scaled]overlay=repeatlast:x=150:y=300[preoutput]',
          '[preoutput][4scaled]overlay=repeatlast:x=450:y=300[output]',
          '[0:a][1:a][2:a][3:a][4:a]amix=inputs=5[a]',
        ])
        .outputOptions([
          '-map [output]', '-map [a]:a', '-c:v h264_nvenc',
        ])
        .on('error', function (er) {
          console.log(`error occurred: ${er.message}`);
          reject(er.message);
        })
        .on('end', function () {
          console.log('successful final merge');
          resolve();
        })
        .save(`${currPath}/p${participantInd}/full_view.mp4`)
        .run();
    });
  }
}

// Run the script
const args = process.argv.slice(2);
const participantID = args[0];
const rotations = JSON.parse(args[1].toString());
try {
run(participantID, rotations);
} catch (err) {
  console.log(err);
}
