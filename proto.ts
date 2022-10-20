/*const qritQLEngine = async () => {
  gritql.use(dataSourceProvider)
  gritql.use(dataSourceGAProvider)

  const { queryParser, resultProcessor, merger } = gritql

  queryParser.use(queryProcessor)
  queryParser.use(queryProcessor)
  queryParser.use(queryProcessor)

  resultProcessor.use(processor)
  resultProcessor.use(processor)
  resultProcessor.use(processor)
  resultProcessor.use(merger)

  return gritql
}*/
/*
async function server(req, res) {
  const { runner, queryParser, resultProcessor } = await qritQLEngine()

  const parsedQuery = await queryParser(req.query)
  let result: any = runner(parsedQuery)
  result = resultProcessor(result)

  result.toJson() //as object
  result.toResponse() //as transportable response
}

const gritql = {
  runner: (q) => {},
  resultProcessor,
  queryParser,
  merger: (r) => {},
  queryRunner: {
    use: (f) => {},
  },
  use: (f) => {},
}

function queryParser(q) {}
queryParser.use = (f) => {}

function resultProcessor(q) {
  return { toJson: (a) => {}, toResponse: (a) => {} }
}
resultProcessor.use = (f) => {}

function queryProcessor() {}
function dataSourceProvider() {}
function dataSourceGAProvider() {}

function transport() {}
function merger(d) {}

function processor() {}
function postProcessing() {}
async function astProcessors(data) {}
async function prepareQueryForDb(data) {}
*/
