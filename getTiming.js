/* eslint-disable prefer-destructuring */
/* eslint-disable vars-on-top */
/* eslint-disable no-multi-assign */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-console */
/* eslint-disable no-param-reassign */
/* eslint-disable max-len */
/* eslint-disable func-names */
// Import packages
const {
  writeFileSync,
} = require('fs');
const glob = require('glob-promise');
const utils = require('./utils');

// Get all of the files in the filepath with `GOPR` in the name and process each
async function run(filePath, participantInd, camera) {
  const currPath = process.cwd();
  const fileOrder = [];

  // Pull the relevant "starter" files for that camera and sort them
  // TODO: FIGURE OUT THE 10 VS 9 INDEX NONSENSE***************************
  const goprFiles = await glob(`${filePath}${camera}/GOPR*.MP4`);
  goprFiles.sort();

  for (const gopr of goprFiles) {
    if (!(['/media/CAR_PROJECTS/Bremers_FamilyCarTrip/P8_05092021/Video_Audio/Navigator/GOPR0151.MP4'].includes(gopr))) {
      fileOrder.push(gopr);

      // Pull the secondary files for each recording, sort, and add to the ordering
      const fileID = gopr.split('GOPR')[1];
      // TODO: FIGURE OUT THE 10 VS 9 INDEX NONSENSE***************************
      const gpFiles = await glob(`${filePath}${camera}/GP*${fileID}`);
      gpFiles.sort();

      for (const gp of gpFiles) {
        fileOrder.push(gp);
      }
    }
  }

  const data = {};
  let prevEnd;
  let cameraStart;
  let maxfDur = 0.0;
  let ind = 0;
  let firstFileID;
  let newCount;

  for (const [idx, file] of fileOrder.entries()) {
    console.log(`Processing ${idx + 1} of ${fileOrder.length}: ${file}`);

    // Add the start time, duration, and geo binary for this file
    try {
      const [startTime, duration, fDur] = await utils.processVid(file, `${currPath}/p${participantInd}`); // new Date(fileData.timing.start).getTime() / 1000;
      maxfDur = Math.max(maxfDur, fDur);

      if (ind === 0) {
        firstFileID = file.split('GOPR')[1].split('.MP4')[0];
      }

      // Get difference in time with the previous file and add a buffer video if necessary
      if (ind === 0) {
        prevEnd = startTime + duration;
        cameraStart = startTime;
      } else {
        // Account for the duration being full length for broken up videos. If video broken up, ignore the offset
        let timeDiff = startTime - prevEnd;

        if (timeDiff < 0.0) {
          const fileID = file.split('GP')[1].slice(2).split('.MP4')[0];
          const fileInd = file.split('GP')[1].split(fileID)[0];
          let indCount = Number(fileInd) - 1;
          newCount = 1;
          while (indCount > 0) {
            if (indCount < 10) {
              console.log(`Fixing timing for GP0${indCount}${fileID}.MP4 by ${utils.makeSeconds(timeDiff)}...`);
              data[`${filePath}${camera}/GP0${indCount}${fileID}.MP4`].start_time += timeDiff;
            } else {
              console.log(`Fixing timing for GP${indCount}${fileID}.MP4 by ${utils.makeSeconds(timeDiff)}...`);
              data[`${filePath}${camera}/GP${indCount}${fileID}.MP4`].start_time += timeDiff;
            }

            console.log(`Fixing timing for ${ind - newCount}_blank.mp4 by ${utils.makeSeconds(timeDiff)}...`);
            data[`${currPath}/${ind - newCount}_blank.mp4`].start_time += timeDiff;
            indCount -= 1;
            newCount += 1;
          }

          console.log(`Fixing timing for GOPR${fileID}.MP4 by ${utils.makeSeconds(timeDiff)}...`);
          data[`${filePath}${camera}/GOPR${fileID}.MP4`].start_time += timeDiff;
          if (fileID === firstFileID) {
            cameraStart = data[`${filePath}${camera}/GOPR${fileID}.MP4`].start_time;
          }
        }

        const blankFile = `${currPath}/${ind}_blank.mp4`;
        data[blankFile] = {};
        data[blankFile].start_time = prevEnd;

        if (timeDiff < 0.0) {
          console.log(`Fixing timing for ${ind}_blank.mp4 by ${utils.makeSeconds(timeDiff)}...`);
          data[`${currPath}/${ind}_blank.mp4`].start_time += timeDiff;
        }

        timeDiff = Math.max(timeDiff, 0.0);
        data[blankFile].duration = timeDiff;

        prevEnd = startTime + duration;
      }
      data[file] = {};
      data[file].start_time = startTime;
      data[file].duration = duration;

      ind += 1;
    } catch (err) {
      console.log(err);
    }
  }

  // Save the concat file info for analysis across cameras
  data.concat_start = cameraStart;
  data.concat_duration = prevEnd - cameraStart;
  data.fps = 1 / maxfDur;
  console.log(data.fps);

  // Put the data into a txt file
  let saveTxt = '';
  saveTxt += `Camera Start: ${new Date(data.concat_start).toISOString()}\n`;
  saveTxt += `Camera End: ${new Date(data.concat_duration + data.concat_start).toISOString()}\n`;
  saveTxt += `Camera Duration: ${utils.getDurStr(utils.makeSeconds(data.concat_duration))}\n`;
  saveTxt += `fps: ${data.fps}\n`;
  saveTxt += '-------------------------------------\n';
  saveTxt += 'Filename                                             Start Time                         Duration                          End Time\n';
  for (const file of Object.keys(data)) {
    if (!(['concat_start', 'concat_duration', 'fps'].includes(file))) {
      saveTxt += `${file}                                     ${new Date(data[file].start_time).toISOString()}                       ${`${utils.getDurStr(utils.makeSeconds(data[file].duration))}`}                      ${new Date(data[file].start_time + data[file].duration).toISOString()}\n`;
    }
  }
  await writeFileSync(`./p${participantInd}/${camera}FileTimings.txt`, saveTxt);
  await writeFileSync(`./p${participantInd}/${camera}FileTimings.json`, JSON.stringify(data));
}

// Run the script
const args = process.argv.slice(2);
const dataPath = args[0];
const participantID = args[1];
const camera = args[2];
run(dataPath, participantID, camera);
