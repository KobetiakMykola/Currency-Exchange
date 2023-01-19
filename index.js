const https = require("https");
const fs = require("fs");

class Currencies {
  constructor() {
    this.currenciesList = {};
  }
  addVertex(vertex, currencyInfo) {
    if (!this.currenciesList[vertex])
      this.currenciesList[vertex] = { currencyInfo, edges: [] };
  }

  addEdge(vertex1, vertex2, exchangeRate, fromCurrencyName, toCurrencyName) {
    this.currenciesList[vertex1].edges.push({
      currency: vertex2,
      currencyName: toCurrencyName,
      exchangeRate
    });
    this.currenciesList[vertex2].edges.push({
      currency: vertex1,
      currencyName: fromCurrencyName,
      exchangeRate
    });
  }

  calculateAmount(path, amount) {
    let sum = 0;
    for (let i = 0; i < path.length; i++) {
      const currencyInfo = this.currenciesList[path[i]].edges.find(
        ({ currency }) => currency === path[i + 1]
      );

      if (currencyInfo) {
        sum =
          i === 0
            ? amount * currencyInfo.exchangeRate
            : sum * currencyInfo.exchangeRate;
      }
    }

    return sum;
  }

  validateInputCurrenciesData(fromCurrency, toCurrency) {
    if (
      !this.currenciesList[fromCurrency] ||
      !this.currenciesList[toCurrency]
    ) {
      return `Entered currency does not exist: ${
        !this.currenciesList[fromCurrency] ? fromCurrency : toCurrency
      }`;
    }

    if (fromCurrency === toCurrency) {
      return `You are trying to exchange ${fromCurrency} to ${toCurrency}. At least one currency should be different`;
    }
    return null;
  }

  async getExchange(fromCurrency, toCurrency, amount = 0) {
    if (!amount) {
      console.error(`Amount should be grater than 0`);
      return;
    }

    await buildGraph();

    const errorMessage = this.validateInputCurrenciesData(
      fromCurrency,
      toCurrency
    );
    if (errorMessage) {
      console.error(errorMessage);
      return;
    }

    if (
      !this.currenciesList[fromCurrency] ||
      !this.currenciesList[toCurrency]
    ) {
      console.error(
        `Entered currency does not exist: ${
          !this.currenciesList[fromCurrency] ? fromCurrency : toCurrency
        }`
      );
      return;
    }

    if (fromCurrency === toCurrency) {
      console.error(
        `You are trying to exchange ${fromCurrency} to ${toCurrency}. At least one currency should be different`
      );
      return;
    }

    const nodes = new PriorityQueue();
    const distances = {};
    const previous = {};
    let path = []; // currencies path to return
    let smallest;
    // build up initial state
    for (let vertex in this.currenciesList) {
      if (vertex === fromCurrency) {
        distances[vertex] = 0;
        nodes.enqueue(vertex, 0);
      } else {
        distances[vertex] = Infinity;
        nodes.enqueue(vertex, Infinity);
      }
      previous[vertex] = null;
    }

    // as long as there is currencies to visit
    while (nodes.values.length) {
      smallest = nodes.dequeue().val;
      if (smallest === toCurrency) {
        // WE ARE DONE
        // BUILD UP CURRENCIES PATH TO RETURN AT END
        while (previous[smallest]) {
          path.push(smallest);
          smallest = previous[smallest];
        }
        break;
      }
      if (smallest || distances[smallest] !== Infinity) {
        for (let neighbor in this.currenciesList[smallest].edges) {
          // find neighboring currency
          let nextNode = this.currenciesList[smallest].edges[neighbor];
          // calculate new distance to neighboring currency
          let candidate = distances[smallest] + nextNode.exchangeRate;
          let nextNeighbor = nextNode.currency;
          if (candidate < distances[nextNeighbor]) {
            // updating new smallest distance to neighbor currency
            distances[nextNeighbor] = candidate;
            // updating previous - How we got to neighbor
            previous[nextNeighbor] = smallest;
            // enqueue in priority queue with new priority
            nodes.enqueue(nextNeighbor, candidate);
          }
        }
      }
    }

    const fullPath = path.concat(smallest).reverse();
    const dataToWrite = buildCSV({
      currencyCode: fromCurrency,
      // Not sure about this one (should be country, but data is not present in json, and to parse currency name is not good idea)
      country: this.currenciesList[toCurrency]?.currencyInfo.currencyName,
      amount: this.calculateAmount(fullPath, amount),
      path: fullPath
    });
    writeCSV(dataToWrite);
  }
}

class PriorityQueue {
  constructor() {
    this.values = [];
  }
  enqueue(val, priority) {
    this.values.push({ val, priority });
    this.sort();
  }
  dequeue() {
    return this.values.shift();
  }
  sort() {
    this.values.sort((a, b) => a.priority - b.priority);
  }
}

const graph = new Currencies();

function getData() {
  return new Promise((resolve, reject) => {
    https
      .get(
        `https://api-coding-challenge.neofinancial.com/currency-conversion?seed=70953`,
        resp => {
          //   .get(process.env.DATA_URL, resp => {
          let data = "";
          resp.on("data", chunk => {
            data += chunk;
          });
          resp.on("end", () => {
            resolve(JSON.parse(data));
          });
        }
      )
      .on("error", err => {
        reject("Error: " + err.message);
      });
  });
}

async function buildGraph() {
  const data = await getData();
  for (const currency of data) {
    graph.addVertex(currency.fromCurrencyCode, {
      currencyName: currency.fromCurrencyName
    });
    graph.addVertex(currency.toCurrencyCode, {
      currencyName: currency.toCurrencyName
    });
  }
  for (const currency of data) {
    graph.addEdge(
      currency.fromCurrencyCode,
      currency.toCurrencyCode,
      currency.exchangeRate,
      currency.fromCurrencyName,
      currency.toCurrencyName
    );
  }
}

function buildCSV({ currencyCode, country, amount, path }) {
  const headers = "Currency code, Country, Amount, Exchange path,";
  const row = `${currencyCode}, ${country}, ${amount}, ${path.join("|")},`;
  return headers + "\n" + row;
}

function writeCSV(data) {
  fs.writeFileSync("exchangeInfo.csv", data);
  console.info("Success. Files was created. Please check: exchangeInfo.csv");
}

// INPUT DATA
graph.getExchange("CAD", "UYU", 100);
