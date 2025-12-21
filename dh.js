#!/usr/bin/env node
// SPDX-License-Identifier: (GPL-2.0-only OR BSD-2-Clause)
import fs from "fs";
import { diagram } from './lib/diagram.js';
import { accessors } from './lib/accessors.js';
import { prepare } from './lib/prepare.js';

const usage = () => {
    console.log(`Usage: ./dh.js [--packet] <model>`);
    console.log(`Example: ./dh.js ./models/econet_eth/qdma_desc.yaml`);
    console.log();
    console.log(`    --packet    # This is a packet diagram, otherwise treated as registers`);
}

const main = () => {
    // Get filename from command line (default: register.yaml)
    if (process.argv.length < 3) {
        return usage();
    }
    let type = 'registers';
    if (process.argv.indexOf('--packet') > -1) {
        type == 'packet';
    }
    const file = process.argv[process.argv.length - 1] || "register.yaml";

    let data_s;
    try {
        data_s = fs.readFileSync(file, "utf8");
    } catch (err) {
        console.error("Error reading YAML:", err.message);
        usage();
        process.exit(1);
    }
    const data = prepare(data_s);
    if (!data) {
        console.log('Exiting because there were errors');
        return;
    }
    // console.log(JSON.stringify(data, null, '  '));
    if (type === 'packet') {
        diagram(data, 'comment');
    }
    accessors(data, type === 'registers');

};
main();