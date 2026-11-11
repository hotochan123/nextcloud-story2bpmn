# Process diagrams serve documentation, not execution

The project started with the goal of producing executable processes for Camunda 8 / Zeebe; the model was grounded in a catalog of real worker job types. When the scope was clarified on 11 Sep 2026, it turned out that the actual aim is only to turn business processes that have been put into words into process diagrams as simply as possible; the processes are not run automatically. The Camunda connection was a miscommunication.

As a result, the worker catalog, the camunda-compat rules and the technical fields (job type, error codes, retries, input/output mappings) no longer serve a purpose. Instead, tasks carry business details (system, documents, description, deadline), and there is only one kind of task instead of Camunda's distinction between human and automatic tasks.

## Consequences

- Grounding in the worker catalog was the stated strategic advantage over Camunda's copilot. That advantage is dropped without replacement; the tool's own value now lies in "text in, readable diagram out, refine through conversation".
- The BPMN output stays BPMN 2.0, but without Zeebe extensions. Only general BPMN rules remain useful as checks.
- The existing Camunda code is not removed for now but left in place until the rebuild is planned.
