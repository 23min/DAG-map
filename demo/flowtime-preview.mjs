#!/usr/bin/env node
// Quick preview: generate an SVG from a FlowTime-like DAG
// Usage: node flowtime-preview.mjs > preview.svg

import { layoutMetro } from '../src/layout.js';
import { renderSVG } from '../src/render.js';

// A simplified version of the topology from the screenshot
const dag = {
  nodes: [
    { id: 'OriginNorth', label: 'OriginNorth', cls: 'pure' },
    { id: 'OriginSouth', label: 'OriginSouth', cls: 'pure' },
    { id: 'CentralHub', label: 'CentralHub', cls: 'pure' },
    { id: 'HubQueue', label: 'HubQueue', cls: 'recordable' },
    { id: 'HubLossQueue', label: 'HubLossQueue', cls: 'gate' },
    { id: 'LineAirport', label: 'LineAirport', cls: 'pure' },
    { id: 'LineIndustrial', label: 'LineIndustrial', cls: 'pure' },
    { id: 'LineDowntown', label: 'LineDowntown', cls: 'pure' },
    { id: 'Airport', label: 'Airport', cls: 'pure' },
    { id: 'Downtown', label: 'Downtown', cls: 'pure' },
    { id: 'Industrial', label: 'Industrial', cls: 'pure' },
    { id: 'AirportStrandedDlq', label: 'AirportStrandedDlq', cls: 'gate' },
    { id: 'unmet_south', label: 'unmet_south', cls: 'side_effecting' },
    { id: 'unmet_north', label: 'unmet_north', cls: 'side_effecting' },
    { id: 'unmet_industrial', label: 'unmet_industrial', cls: 'side_effecting' },
    { id: 'unmet_downtown', label: 'unmet_downtown', cls: 'side_effecting' },
    { id: 'hub_loss_attrition', label: 'hub_loss_attrition', cls: 'side_effecting' },
    { id: 'hub_loss_inflow', label: 'hub_loss_inflow', cls: 'side_effecting' },
    { id: 'hub_queue_attrition', label: 'hub_queue_attrition', cls: 'side_effecting' },
    { id: 'errors_airport', label: 'errors_airport', cls: 'side_effecting' },
    { id: 'airport_dlq_inflow', label: 'airport_dlq_inflow', cls: 'side_effecting' },
  ],
  edges: [
    ['OriginNorth', 'CentralHub'],
    ['OriginSouth', 'CentralHub'],
    ['CentralHub', 'HubQueue'],
    ['HubQueue', 'LineAirport'],
    ['HubQueue', 'LineIndustrial'],
    ['HubQueue', 'LineDowntown'],
    ['HubQueue', 'HubLossQueue'],
    ['LineAirport', 'Airport'],
    ['LineIndustrial', 'Industrial'],
    ['LineDowntown', 'Downtown'],
    ['Airport', 'AirportStrandedDlq'],
    // Loss/error edges
    ['OriginNorth', 'unmet_north'],
    ['OriginSouth', 'unmet_south'],
    ['CentralHub', 'hub_loss_inflow'],
    ['CentralHub', 'hub_loss_attrition'],
    ['HubQueue', 'hub_queue_attrition'],
    ['HubLossQueue', 'hub_loss_attrition'],
    ['LineAirport', 'errors_airport'],
    ['LineIndustrial', 'unmet_industrial'],
    ['LineDowntown', 'unmet_downtown'],
    ['AirportStrandedDlq', 'airport_dlq_inflow'],
  ],
};

const layout = layoutMetro(dag, {
  routing: 'angular',
  theme: 'dark',
  scale: 1.8,
  direction: 'ltr',
});

const svg = renderSVG(dag, layout, {
  title: 'FlowTime — Transit Hub Model',
  subtitle: null,
  showLegend: true,
  legendLabels: {
    pure: 'Service',
    recordable: 'Queue',
    side_effecting: 'Loss/Error',
    gate: 'DLQ/Control',
  },
});

process.stdout.write(svg);
