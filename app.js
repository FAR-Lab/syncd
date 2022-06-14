#!/usr/bin/env node
/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-console */
const fs = require('fs'); // The file system module, makes things easier
const utils = require('./src/utils'); // Custom utils from utils.js for syncd
const syncFuncs = require('./src/syncFuncs'); // The main commands for syncing and combining videos

// Try to catch all high-level unhandled rejections
process.on('unhandledRejection', (err) => {
  console.error(err);
  process.exit(1);
});

// Get the file structure and begin processing
async function main(dataPath, rotations, destPath, compute, allFiles) {
  const fileStructure = utils.getFileStructure(dataPath);
  console.log('File Structure:');
  console.log(fileStructure);
  const participantList = Object.keys(fileStructure);

  // Check if the destination paths exists and, if not, make them
  fs.access(destPath, (error) => {
    if (error) {
      fs.mkdirSync(destPath);
    }
  });

  for (const participant of participantList) {
    console.log(`Running for participant ${participant}...`);

    // Make a directory for the participant's data if it isn't already present
    const partPath = `${destPath}/${participant}`;
    fs.access(partPath, (error) => {
      if (error) {
        fs.mkdirSync(partPath);
      }
    });

    // Make a directory for each camera
    Object.keys(fileStructure[participant]).forEach((camera) => {
      const camPath = `${destPath}/${participant}/${camera}`;
      fs.access(camPath, (error) => {
        if (error) {
          fs.mkdirSync(camPath);
        }
      });
    });

    // run the video sync on the participant's data
    syncFuncs.runSync(participant, dataPath, fileStructure, rotations,
      destPath, compute, allFiles);
  }

  // console.log('Finished running for all participants...');
}

// Read in the command line arguments
const [dataPath, rotations, destPath, compute, allFiles] = utils.readParams();

// Run the main function
if (require.main === module) {
  main(dataPath, rotations, destPath, compute, allFiles);
}
