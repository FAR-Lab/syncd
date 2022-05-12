/* eslint-disable no-console */
const ffmpeg = require('fluent-ffmpeg'); // https://www.npmjs.com/package/fluent-ffmpeg

function acceleration(compute) {
  let inputAccel = [];
  const outputAccel = [];
  if (compute) {
    inputAccel = ['-hwaccel cuda', '-vsync 0', '-hwaccel_output_format cuda'];
    outputAccel.push('-c:v h264_nvenc');
  }
  return [inputAccel, outputAccel];
}

async function makeBlank(speed, durationStr, saveFile, compute) {
  const [inputAccel, outputAccel] = acceleration(compute);
  outputAccel.push(durationStr);

  await new Promise((resolve, reject) => {
    ffmpeg(`color=size=1920x1080:rate=${speed}:color=black`).inputFormat('lavfi').input('anullsrc=channel_layout=stereo:sample_rate=48000').inputFormat('lavfi')
      .inputOptions(inputAccel)
      .outputOptions(outputAccel)
      .on('error', (err) => {
        console.log(err);
        reject(err);
      })
      .on('end', () => {
        console.log('finished running blank between same camera videos');
        resolve();
      })
      .save(saveFile)
      .run();
  });
}

async function changeFPS(file, speed, saveFile, compute) {
  const [inputAccel, outputAccel] = acceleration(compute);
  outputAccel.push('-c:a copy');

  await new Promise((resolve, reject) => {
    ffmpeg().input(file).complexFilter([`fps=${speed}`])
      .inputOptions(inputAccel)
      .outputOptions(outputAccel)
      .on('error', (err) => {
        console.log(err);
        reject(err);
      })
      .on('end', () => {
        console.log('finished changing fps for video');
        resolve();
      })
      .save(saveFile)
      .run();
  });
}

async function combineCamera(txtFile, saveFile, compute) {
  const [inputAccel, outputAccel] = acceleration(compute);
  outputAccel.push('-c:a copy');

  await new Promise((resolve, reject) => {
    ffmpeg().input(txtFile).inputOptions(['-f concat', '-safe 0'])
      .inputOptions(inputAccel)
      .outputOptions(outputAccel)
      .on('error', (err) => {
        reject(err);
      })
      .on('end', () => {
        console.log('finished running merge for camera');
        resolve();
      })
      .save(saveFile)
      .run();
  });
}

async function rotate(file, rotation, saveFile, compute) {
  // eslint-disable-next-line prefer-const
  let [inputAccel, outputAccel] = acceleration(compute);
  inputAccel = inputAccel.slice(1);

  await new Promise((resolve, reject) => {
    ffmpeg().input(file).withVideoFilter([`transpose=${rotation}`])
      .inputOptions(inputAccel)
      .complexFilter([
        '[0:v]scale=1920x1080[scaled]',
        '[scaled]pad=width=2233:x=1166:color=black[padded]',
      ])
      .outputOptions(outputAccel.push('-map [padded]'))
      .on('error', (err) => {
        reject(err);
      })
      .on('end', () => {
        console.log('rotated');
        resolve();
      })
      .save(saveFile)
      .run();
  });
}

async function sideBySide(mergeFiles, saveFile, cameras, compute) {
  // eslint-disable-next-line prefer-const
  let [inputAccel, outputAccel] = acceleration(compute);
  inputAccel = inputAccel.slice(1);

  const numFiles = mergeFiles.length;
  if (numFiles > 1) {
    const paddingH = Math.ceil(Math.sqrt(numFiles));
    const paddingW = Math.ceil(numFiles / paddingH);

    const cmd = ffmpeg();
    const complexFilt = [];
    const outputOptions = [];
    outputOptions.push(outputAccel);
    let fileInd = 0;

    mergeFiles.forEach((file) => {
      cmd.input(file);
      complexFilt.push(`[${fileInd}:v]scale=300:300[${fileInd}scaled]`);
      outputOptions.push(`-map ${fileInd}:a`);
      outputOptions.push(`-metadata:s:a:${fileInd} title="${cameras[fileInd]}"`);
      fileInd += 1;
    });

    // bottom row offset: ((w * h) - numFiles) * 150
    // in last row if: (w * h) - # < w
    // x: (# - Math.floor(# / w) * w) * 300
    // y: Math.floor(# / w) * 300
    complexFilt.push(`[0scaled]pad=${paddingW * 300}:${paddingH * 300}[output0]`);
    fileInd = 1;
    let outName = '';
    mergeFiles.forEach(() => {
      outName = `output${fileInd}`;
      let xPix = (fileInd - (Math.floor(fileInd / paddingW) * paddingW)) * 300;
      if ((paddingW * paddingH) - (fileInd + 1) < paddingW) {
        xPix += ((paddingW * paddingH) - numFiles) * 150;
      }
      const yPix = Math.floor(parseFloat(fileInd) / paddingW) * 300;
      complexFilt.push(`[output${fileInd}][${fileInd}scaled]overlay=repeatlast:x=${xPix}:y=${yPix}[${outName}]`);
      fileInd += 1;
    });
    outputOptions.push('-c:a copy');
    outputOptions.push(`-map [${outName}]`);
    cmd.inputOptions(inputAccel);
    cmd.complexFilter(complexFilt);
    cmd.outputOptions(outputOptions);

    await new Promise((resolve, reject) => {
      cmd
        .on('error', (er) => {
          console.log(er);
          console.log(`error occurred: ${er.message}`);
          reject(er.message);
        })
        .on('end', () => {
          console.log('successful final merge');
          resolve();
        })
        .save(saveFile)
        .run();
    });
  } else {
    console.log(`You only have one camera. Go ahead and just watch the concat.MP4 file 
      under the camera's directory.`);
  }
}

module.exports = {
  changeFPS,
  makeBlank,
  combineCamera,
  sideBySide,
  rotate,
};
