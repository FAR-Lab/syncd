#!/usr/bin/env node
const fs = require('fs');
const utils = require('./src/utils');
const syncFuncs = require('./src/syncFuncs');

// Get the file structure and begin processing
async function main(dataPath, rotations, destPath, compute, allFiles) {
  const fileStructure = await utils.getFileStructure(dataPath);
  console.log(fileStructure);
  const participantList = Object.keys(fileStructure);

  // Check if the destination paths exists and, if not, make them
  fs.access(destPath, (error) => {
    if (error) {
      fs.mkdirSync(destPath);
    }
  });

  participantList.forEach((participant) => {
    console.log(`Running for participant ${participant}...`);

    // Make a directory for the participant's data
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
    syncFuncs.runSync(participant, dataPath, fileStructure, rotations, destPath, compute, allFiles);
  });

  console.log('Finished running for all participants...');
}

// Read in the command line arguments
const [dataPath, rotations, destPath, compute, allFiles] = utils.readParams();

// Run the main function
if (require.main === module) {
  main(dataPath, rotations, destPath, compute, allFiles);
}
