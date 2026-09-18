/**
 * Build-time switch for the "viewer + schedule only" variant. Set
 * `VITE_ENABLE_ESTIMATION=false` (see `.env.viewer-schedule`) to bake a build
 * that never renders the estimation UI - not just hidden, the BOQ/assembly/
 * estimator-chat panels and their entry points are gated off entirely, so
 * there is no in-app path to reach them.
 */
export const ESTIMATION_ENABLED = import.meta.env.VITE_ENABLE_ESTIMATION !== 'false'
