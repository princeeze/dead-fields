import type { Node } from "ts-morph";

const IGNORE_OBJECT_DIRECTIVE = "dead-fields-ignore-object";

export function hasIgnoreObjectComment(node: Node): boolean {
  for (const comment of node.getLeadingCommentRanges()) {
    const text = comment.getText();
    if (text.includes(IGNORE_OBJECT_DIRECTIVE)) {
      return true;
    }
  }

  return false;
}
