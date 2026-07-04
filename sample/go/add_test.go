package main

import "testing"

func TestAdd(t *testing.T) {
	if got := Sum(2, 3); got != 5 {
		t.Fatalf("got %d want 5", got)
	}
}
