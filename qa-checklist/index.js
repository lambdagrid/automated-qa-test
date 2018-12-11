// `require("automated-qa-worker")` will import the client library to create
// your QA checklist.
const { flow, act, check } = require("automated-qa-worker");

// Using `request` isn't necessary. We use it only to make HTTP requests easier.
let request = require("request-promise-native");
request = request.defaults({
  simple: false,
  json: true,
});

// A utility to create URLs to be passed to `request`. Our API uses basic
// authentication, so we add the `key` as the `user:password` in the URL.
const url = (path, key) => {
  const root = process.env.TARGET_ROOT || "localhost:3001";
  if (key) {
    return `http://${key}@${root}${path}`;
  } else {
    return `http://${root}${path}`;
  }
};

// These lines are variables that we'll set and unset in our script.
let apiKey = "";
let apiKey2 = "";
let id1 = null;
let id2 = null;

// The next few functions are invoked several times in our script, so we
// declare them once here to keep our code DRY.
const getListOfTodos = () => request(url("/todos", apiKey));

const stripIdFromItem = (res) => {
  delete res.data.todo.id;
  return res;
};

const stripIdFromList = (res) => {
  res.data.todos.forEach((item) => delete item.id);
  return res;
};

// Here's the core of the QA checklist! Our aim is for the code to be self-
// documenting, for entry-level engineers to intuit the checklist's intention.
flow("Basic API functionality", () => {

  // Check that we get 404 Page Not Found when requesting nonsense URLs.
  act(
    "ping API endpoints that don't exist",
    () => request(url("/intentional-4o4")),
  );
  check("returns 404 not found");

  // Check that we require authorization to see a list of todos.
  act("ping URL requiring authentication", () => request(url("/todos")));
  check("returns 401 not authorized");

  // When we create an API key and then use it to get a list of todos, the
  // request succeeds and we see we haven't created any todos yet.
  act(
    "get an API key",
    () => request.post(url("/api-keys")).then(res => {
      apiKey = res.data.api_key;
    }),
  );
  act("fetch todos", getListOfTodos);
  check("list should be empty");

  // Ensure invalid todo creation payloads can't successfully create todos.
  act(
    "submit some invalid todos",
    () => request.post({
      uri: url("/todos", apiKey),
      body: {
        this_payload_format_is: "wrong",
      },
      json: true,
    }),
  );
  check("invalid todos should return 4xx");

  // But also make sure valid payloads will succeed to create todos.
  act(
    "submit a valid todo",
    () => request.post({
      uri: url("/todos", apiKey),
      body: {
        text: "brush teeth",
      },
      json: true,
    }),
  );
  // We add `stripIdFromItem` as the second argument to `check` because the ID
  // is not deterministic. The callback as the second argument will modify
  // values to be checked with the intent to make them deterministic. Snapshots
  // won't work if the return values aren't deterministic!
  check("returns a 201", stripIdFromItem);

  // Now we should see one todo on our todo list!
  act("fetch todos", getListOfTodos);
  check("list should have one todo", stripIdFromList);

  act(
    "submit a second todo",
    () => request.post({
      uri: url("/todos", apiKey),
      body: {
        text: "wash face",
      },
      json: true,
    }),
  );
  act("fetch todos", getListOfTodos);
  // `act` and `check` just build a promise chain for any function's argument to
  // be the return value of the preceeding function. To illustrate, the
  // `todoRes` argument in the callback below is the return value from the
  // preceeding function, `getListOfTodos`.
  act(
    "copy down the ids of the todos",
    todosRes => {
      id1 = todosRes.data.todos[0].id;
      id2 = todosRes.data.todos[1].id;
      return todosRes;
    },
  );
  check("list should have two items", stripIdFromList);

  // We're now taking advantage of `id1`, which we set in the above `act`.
  act(
    "mark first todo as 'done'",
    () => request.put({
      uri: url(`/todos/${id1}`, apiKey),
      body: { done: true },
    }),
  );
  act("fetch todos", getListOfTodos);
  check("first todo should be done", stripIdFromList);

  act(
    "change text of second todo",
    () => request.put({
      uri: url(`/todos/${id2}`, apiKey),
      body: { text: "wash face gently" },
    }),
  );
  act("fetch todos", getListOfTodos);
  check("second todo has new text", stripIdFromList);

  // Ensure that the first user's todos aren't visible to the second user.
  act(
    "get a second API key",
    () => request.post(url("/api-keys")).then(res => {
      apiKey2 = res.data.api_key;
    });
  );
  act("get todos for second API key", () => request(url("/todos", apiKey2)));
  check("second list should be empty");

  act("delete a todo", () => request.del(url(`/todos/${id1}`, apiKey)));
  act("fetch todos", getListOfTodos);
  check("first todo is deleted", stripIdFromList);

  act("delete second todo", () => request.delete(url(`/todos/${id2}`, apiKey)));
  act("fetch todos", getListOfTodos);
  check("second todo is deleted", stripIdFromList);

  // Cleanup! Make sure we can delete our API keys and todo lists successfully.
  act("delete second API key", () => request.del(url("/api-keys", apiKey2)));
  act("test second API key", () => request(url("/todos", apiKey2)));
  check("second key should be invalid");

  act("delete first API key", () => request.del(url("/api-keys", apiKey)));
  act("test first API key", getListOfTodos);
  check("first key should be invalid");
});
