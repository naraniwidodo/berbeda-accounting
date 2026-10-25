# Tests

Evidence for the claims in `output/report.html`. Run them from the project root
with the backend venv.

```bash
backend/.venv/bin/python backend/tests/test_grounding.py   # offline, no model calls
backend/.venv/bin/python backend/tests/test_hops.py        # calls the model
backend/.venv/bin/python backend/tests/test_output.py      # calls the model
backend/.venv/bin/python backend/tests/test_long_question.py  # calls the model
```

| File | Question it answers |
|---|---|
| `test_grounding.py` | Does `check_grounding` let real figures through and stop invented ones? |
| `test_hops.py` | How many model calls does a real question need, and does the ceiling of 8 stop any? |
| `test_output.py` | Does the 400-token output cap cut answers off? |
| `test_long_question.py` | Does one very long question hit a limit, and does splitting it in two work? |

`test_hops.py` and `test_output.py` need entries in the journal, otherwise the
financial tools have nothing to return.
