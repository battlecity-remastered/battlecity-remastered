import ts from "typescript";

const isFunction = (node) => ts.isFunctionDeclaration(node)
    || ts.isFunctionExpression(node) || ts.isArrowFunction(node)
    || ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node)
    || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node);

const isDecision = (node) => ts.isIfStatement(node) || ts.isConditionalExpression(node)
    || ts.isForStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node)
    || ts.isWhileStatement(node) || ts.isDoStatement(node) || ts.isCaseClause(node)
    || ts.isCatchClause(node) || (ts.isBinaryExpression(node)
        && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken,
            ts.SyntaxKind.QuestionQuestionToken].includes(node.operatorToken.kind));

const functionName = (node, source) => {
    if (node.name) return node.name.getText(source);
    if (ts.isVariableDeclaration(node.parent) || ts.isPropertyAssignment(node.parent)) {
        return node.parent.name.getText(source);
    }
    return "<callback>";
};

// Measure TypeScript functions, not strings, comments or type syntax. Nested
// callbacks have their own metrics and do not inflate the enclosing function.
export const measureSource = (text, fileName = "source.ts") => {
    const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
    if (source.parseDiagnostics.length > 0) {
        throw new Error(`Cannot measure malformed TypeScript: ${fileName}`);
    }
    const functions = [];
    const measure = (node) => {
        let complexity = 1;
        let nestedLines = 0;
        const visitBody = (child) => {
            if (isFunction(child)) {
                // Count a nested function separately. Keep its boundary lines,
                // which can also contain statements in the enclosing function.
                const start = source.getLineAndCharacterOfPosition(child.getStart(source)).line;
                const end = source.getLineAndCharacterOfPosition(child.end).line;
                nestedLines += Math.max(0, end - start - 1);
                return;
            }
            if (isDecision(child)) complexity++;
            ts.forEachChild(child, visitBody);
        };
        visitBody(node.body);
        const startLine = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        const endLine = source.getLineAndCharacterOfPosition(node.end).line + 1;
        functions.push({ name: functionName(node, source), line: startLine,
            lines: endLine - startLine + 1 - nestedLines, complexity });
    };
    const visit = (node) => {
        if (isFunction(node) && node.body) measure(node);
        ts.forEachChild(node, visit);
    };
    visit(source);
    return functions;
};
