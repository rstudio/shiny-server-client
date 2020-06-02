JSFILES := $(wildcard lib/*.js lib/decorators/*.js common/*.js)
TESTS = test/*.js
REPORTER = list

all: dist/shiny-server-client.min.js lint

build: dist/shiny-server-client.min.js

dist/shiny-server-client.js: $(JSFILES)
	mkdir -p dist
	npx browserify lib/main.js -o dist/shiny-server-client.js -t babelify

dist/shiny-server-client.min.js: dist/shiny-server-client.js
	npx uglifyjs < dist/shiny-server-client.js > dist/shiny-server-client.min.js

test:
	./node_modules/.bin/mocha \
		--require @babel/register \
		--reporter $(REPORTER) \
		$(TESTS)

clean:
	rm -f dist/shiny-server-client.js dist/shiny-server-client.min.js

lint:
	npx eslint lib
	npx eslint -c .eslintrc.es5.js common
	npx eslint --env=mocha test

.PHONY: test clean all build lint
