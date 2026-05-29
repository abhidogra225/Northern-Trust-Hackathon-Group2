const path = require('path');

/** Canonical workflow-definitions directory (project root). */
const WORKFLOW_DEFINITIONS_DIR = path.join(__dirname, '../../../workflow-definitions');

function workflowDefinitionPath(workflowName) {
  return path.join(WORKFLOW_DEFINITIONS_DIR, `${workflowName}.yaml`);
}

module.exports = {
  WORKFLOW_DEFINITIONS_DIR,
  workflowDefinitionPath,
};
