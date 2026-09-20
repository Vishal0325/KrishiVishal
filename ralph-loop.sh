#!/bin/bash
MAX_ITERATIONS=10
ITERATION=1
TASK="Run tests and fix errors until all pass"

echo "Starting Ralph Loop..."

while [ $ITERATION -le $MAX_ITERATIONS ]; do
    echo "--- Iteration $ITERATION ---"
    
    # Run your test command here, e.g., ./gradlew test
    # if ./gradlew test; then
    #     echo "All tests passed! Task complete."
    #     exit 0
    # fi
    
    echo "Tests failed. Triggering AI agent..."
    # Call your CLI AI agent here, e.g., claude, agy, or similar
    # agy --task "$TASK. Fix the failing tests."
    
    echo "Agent finished iteration $ITERATION. Looping..."
    ITERATION=$((ITERATION+1))
done

echo "Ralph Loop stopped: Reached max iterations."
