#!/usr/bin/env node
/** The original heatmap command now renders the contribution city. */
import { writeContributionCity } from './render-city.mjs';

try { writeContributionCity(); }
catch (error) { console.error(`[city] ${error.message}`); process.exitCode = 1; }
