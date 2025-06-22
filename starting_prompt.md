as an input - this is the goal we are moving towards:
--------------------------
There is graphql library method that can parse graphql query into AST. Then I want to use this AST to convert the query into SQL using intent library and execute the query to database. The results from the query, using the AST i can covert into an object that will repeat structure of gritql query.
the process should be:
graphql->AST->Walk AST, build intent query->finalize query->execute query->get result->walk AST, build converter-> convert into object.
the converter will go through the AST and considers sections as dimensions and leafs as metrics. There are parsers for metrics and parsers for dimensions. And each could also be having directives on this nodes that could futher modify the behavior.
the interesting part is that directives might be able to affect on before finalisation of a query, theoretically before execution, after execution, on converter, and on a row based level during convertion, and at the end on whole result.
I want gritql to be extendable, so plugins should be able to plug in into any of this points. Also i need to be able to extend with custom metric parsers and dimension parsers.

previous version of a library you can find here:
/Users/edjafarov/work/gritql4/gql-sql-slicer.ts, take it for information just to see where am i going. This is previous version that I want to rebuild from scratch adding way more flexibility and extencibility, and write it as lean as possible. And instead of direct using knex, intent library ./intent.ts will be used.

1. First think through the problem, read the codebase for relevant files, and write a plan to projectplan.md
2. The plan should have a list of todo items that you can check off as you complete them
3. Before you begin working, check in with me and I will verify the plan
4. Then, begin working on the todo items, marking them as complete as you go
5. Please every step of the way just give me a high level explanation of what changes you made
6. Make every task and code change you do as simple as possible. We want to avoid making any massive or complex changes. Every change should impact as little code as possible. Everything is about simplicity
7. Finally, add a review section to the projectplan.md file with a summary of the changes you made and any other relevant information
--------------------------
check currently implemented parts, and verify they are aligned with the goal.check  projectplan.md for already implemented steps. and pick it up from where it was left off.

first think ultrahard if there should be things improved in projectplan. 