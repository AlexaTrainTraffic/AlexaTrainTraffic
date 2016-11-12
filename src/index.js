/**
    Copyright 2014-2015 Amazon.com, Inc. or its affiliates. All Rights Reserved.

    Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance with the License. A copy of the License is located at

        http://aws.amazon.com/apache2.0/

    or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
*/

/**
 * This sample shows how to create a Lambda function for handling Alexa Skill requests that:
 *
 * - Web service: communicate with an external web service to get events for specified days in history (Wikipedia API)
 * - Pagination: after obtaining a list of events, read a small subset of events and wait for user prompt to read the next subset of events by maintaining session state
 * - Dialog and Session state: Handles two models, both a one-shot ask and tell model, and a multi-turn dialog model.
 * - SSML: Using SSML tags to control how Alexa renders the text-to-speech.
 *
 * Examples:
 * One-shot model:
 * User:  "Alexa, ask History Buff what happened on August thirtieth."
 * Alexa: "For August thirtieth, in 2003, [...] . Wanna go deeper in history?"
 * User: "No."
 * Alexa: "Good bye!"
 *
 *
 * Dialog model:
 * User:  "Alexa, open train traffic"
 * Alexa: "What train would you like information on?"
 * User:  "The 5 train."
 * Alexa: "There is a service disruption.  Would you like to information on other trains?"
 * User: "No."
 * Alexa: "Good bye!"
 */


/**
 * App ID for the skill
 */
var APP_ID = undefined; //replace with 'amzn1.echo-sdk-ams.app.[your-unique-value-here]';

var https = require('https');


/**
 * The AlexaSkill Module that has the AlexaSkill prototype and helper functions
 */
var AlexaSkill = 'use strict';

function AlexaSkill(appId) {
    this._appId = appId;
}

AlexaSkill.speechOutputType = {
    PLAIN_TEXT: 'PlainText',
    SSML: 'SSML'
}

AlexaSkill.prototype.requestHandlers = {
    LaunchRequest: function (event, context, response) {
        this.eventHandlers.onLaunch.call(this, event.request, event.session, response);
    },

    IntentRequest: function (event, context, response) {
        this.eventHandlers.onIntent.call(this, event.request, event.session, response);
    },

    SessionEndedRequest: function (event, context) {
        this.eventHandlers.onSessionEnded(event.request, event.session);
        context.succeed();
    }
};

/**
 * Override any of the eventHandlers as needed
 */
AlexaSkill.prototype.eventHandlers = {
    /**
     * Called when the session starts.
     * Subclasses could have overriden this function to open any necessary resources.
     */
    onSessionStarted: function (sessionStartedRequest, session) {
    },

    /**
     * Called when the user invokes the skill without specifying what they want.
     * The subclass must override this function and provide feedback to the user.
     */
    onLaunch: function (launchRequest, session, response) {
        throw "onLaunch should be overriden by subclass";
    },

    /**
     * Called when the user specifies an intent.
     */
    onIntent: function (intentRequest, session, response) {
        var intent = intentRequest.intent,
            intentName = intentRequest.intent.name,
            intentHandler = this.intentHandlers[intentName];
        if (intentHandler) {
            console.log('dispatch intent = ' + intentName);
            intentHandler.call(this, intent, session, response);
        } else {
            throw 'Unsupported intent = ' + intentName;
        }
    },

    /**
     * Called when the user ends the session.
     * Subclasses could have overriden this function to close any open resources.
     */
    onSessionEnded: function (sessionEndedRequest, session) {
    }
};

/**
 * Subclasses should override the intentHandlers with the functions to handle specific intents.
 */
AlexaSkill.prototype.intentHandlers = {};

AlexaSkill.prototype.execute = function (event, context) {
    try {
        console.log("session applicationId: " + event.session.application.applicationId);

        // Validate that this request originated from authorized source.
        if (this._appId && event.session.application.applicationId !== this._appId) {
            console.log("The applicationIds don't match : " + event.session.application.applicationId + " and "
                + this._appId);
            throw "Invalid applicationId";
        }

        if (!event.session.attributes) {
            event.session.attributes = {};
        }

        if (event.session.new) {
            this.eventHandlers.onSessionStarted(event.request, event.session);
        }

        // Route the request to the proper handler which may have been overriden.
        var requestHandler = this.requestHandlers[event.request.type];
        requestHandler.call(this, event, context, new Response(context, event.session));
    } catch (e) {
        console.log("Unexpected exception " + e);
        context.fail(e);
    }
};

var Response = function (context, session) {
    this._context = context;
    this._session = session;
};

function createSpeechObject(optionsParam) {
    if (optionsParam && optionsParam.type === 'SSML') {
        return {
            type: optionsParam.type,
            ssml: optionsParam.speech
        };
    } else {
        return {
            type: optionsParam.type || 'PlainText',
            text: optionsParam.speech || optionsParam
        }
    }
}

Response.prototype = (function () {
    var buildSpeechletResponse = function (options) {
        var alexaResponse = {
            outputSpeech: createSpeechObject(options.output),
            shouldEndSession: options.shouldEndSession
        };
        if (options.reprompt) {
            alexaResponse.reprompt = {
                outputSpeech: createSpeechObject(options.reprompt)
            };
        }
        if (options.cardTitle && options.cardContent) {
            alexaResponse.card = {
                type: "Simple",
                title: options.cardTitle,
                content: options.cardContent
            };
        }
        var returnResult = {
                version: '1.0',
                response: alexaResponse
        };
        if (options.session && options.session.attributes) {
            returnResult.sessionAttributes = options.session.attributes;
        }
        return returnResult;
    };

    return {
        tell: function (speechOutput) {
            this._context.succeed(buildSpeechletResponse({
                session: this._session,
                output: speechOutput,
                shouldEndSession: true
            }));
        },
        tellWithCard: function (speechOutput, cardTitle, cardContent) {
            this._context.succeed(buildSpeechletResponse({
                session: this._session,
                output: speechOutput,
                cardTitle: cardTitle,
                cardContent: cardContent,
                shouldEndSession: true
            }));
        },
        ask: function (speechOutput, repromptSpeech) {
            this._context.succeed(buildSpeechletResponse({
                session: this._session,
                output: speechOutput,
                reprompt: repromptSpeech,
                shouldEndSession: false
            }));
        },
        askWithCard: function (speechOutput, repromptSpeech, cardTitle, cardContent) {
            this._context.succeed(buildSpeechletResponse({
                session: this._session,
                output: speechOutput,
                reprompt: repromptSpeech,
                cardTitle: cardTitle,
                cardContent: cardContent,
                shouldEndSession: false
            }));
        }
    };
})();

/**
 * URL prefix to download history content from Wikipedia
 */
var urlPrefix = 'https://damp-garden-70395.herokuapp.com/';

/**
 * Variable defining number of events to be read at one time
 */
/*var paginationSize = 3;*/

/**
 * Variable defining the length of the delimiter between events
 */
/*var delimiterSize = 2;*/

/**
 * TrainTrafficSkill is a child of AlexaSkill.
 * To read more about inheritance in JavaScript, see the link below.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Introduction_to_Object-Oriented_JavaScript#Inheritance
 */
var TrainTrafficSkill = function() {
    AlexaSkill.call(this, APP_ID);
};

// Extend AlexaSkill
TrainTrafficSkill.prototype = Object.create(AlexaSkill.prototype);
TrainTrafficSkill.prototype.constructor = TrainTrafficSkill;

TrainTrafficSkill.prototype.eventHandlers.onSessionStarted = function (sessionStartedRequest, session) {
    console.log("TrainTrafficSkill onSessionStarted requestId: " + sessionStartedRequest.requestId
        + ", sessionId: " + session.sessionId);

    // any session init logic would go here
};

TrainTrafficSkill.prototype.eventHandlers.onLaunch = function (launchRequest, session, response) {
    console.log("TrainTrafficSkill onLaunch requestId: " + launchRequest.requestId + ", sessionId: " + session.sessionId);
    getWelcomeResponse(response);
};

TrainTrafficSkill.prototype.eventHandlers.onSessionEnded = function (sessionEndedRequest, session) {
    console.log("onSessionEnded requestId: " + sessionEndedRequest.requestId
        + ", sessionId: " + session.sessionId);

    // any session cleanup logic would go here
};

TrainTrafficSkill.prototype.intentHandlers = {

    "GetFirstEventIntent": function (intent, session, response) {
        handleFirstEventRequest(intent, session, response);
    },

    "GetNextEventIntent": function (intent, session, response) {
        handleNextEventRequest(intent, session, response);
    },

    "AMAZON.HelpIntent": function (intent, session, response) {
        var speechText = "With Train Traffic, you can check the status of your trainline.  " +
            "For example, you could say how is service on the yellow line?";
        var repromptText = "Which trainline color do you want?";
        var speechOutput = {
            speech: speechText,
            type: AlexaSkill.speechOutputType.PLAIN_TEXT
        };
        var repromptOutput = {
            speech: repromptText,
            type: AlexaSkill.speechOutputType.PLAIN_TEXT
        };
        response.ask(speechOutput, repromptOutput);
    },

    "AMAZON.StopIntent": function (intent, session, response) {
        var speechOutput = {
                speech: "Goodbye",
                type: AlexaSkill.speechOutputType.PLAIN_TEXT
        };
        response.tell(speechOutput);
    },

    "AMAZON.CancelIntent": function (intent, session, response) {
        var speechOutput = {
                speech: "Goodbye",
                type: AlexaSkill.speechOutputType.PLAIN_TEXT
        };
        response.tell(speechOutput);
    }
};

/**
 * Function to handle the onLaunch skill behavior
 */

function getWelcomeResponse(response) {
    // If we wanted to initialize the session to have some attributes we could add those here.
    var cardTitle = "Trainline status";
    var repromptText = "With Train Traffic, you can check the status of your trainline.  " +
            "For example, you could say how is service on the yellow line?. Now, which trainline color do you want?";
    var speechText = "<p>Rider.</p> <p>What trainline color do you want status information for?</p>";
    var cardOutput = "Rider. What trainline color do you want status information for?";
    // If the user either does not reply to the welcome message or says something that is not
    // understood, they will be prompted again with this text.

    var speechOutput = {
        speech: "<speak>" + speechText + "</speak>",
        type: AlexaSkill.speechOutputType.SSML
    };
    var repromptOutput = {
        speech: repromptText,
        type: AlexaSkill.speechOutputType.PLAIN_TEXT
    };
    response.askWithCard(speechOutput, repromptOutput, cardTitle, cardOutput);
}

/**
 * Gets a poster prepares the speech to reply to the user.
 */
function handleFirstEventRequest(intent, session, response) {
    var lineColorSlot = intent.slots.train;
    var repromptText = "With Train Traffic, you can check the status of your trainline.  " +
            "For example, you could say how is service on the yellow line?. Now, which trainline color do you want?";
    /*var monthNames = ["January", "February", "March", "April", "May", "June",
                      "July", "August", "September", "October", "November", "December"
    ];*/
    var sessionAttributes = {};
    // Read the first 3 events, then set the count to 3
    /*sessionAttributes.index = paginationSize;*/
    /*var date = "";*/

    // If the user provides a date, then use that, otherwise use today
    // The date is in server time, not in the user's time zone. So "today" for the user may actually be tomorrow
    /*if (lineColorSlot && lineColorSlot.value) {
        date = new Date(lineColorSlot.value);
    } else {
        date = new Date();
    }*/

    var prefixContent = "<p>For the " + lineColorSlot + "line, there is currently, </p>";
    var cardContent = "For the " + lineColorSlot + "line, there is currently, ";

    var cardTitle = "Status of the" + lineColorSlot + "line.";


    getJsonEventsFromMTA(function (results) {
        var speechText = ""
        if (!results) {
            speechText = "There is a problem connecting to the MTA at this time. Please try again later.";
            cardContent = speechText;
            response.tell(speechText);
        } else {
            switch (lineColorSlot) {
                case 'yellow':
                  sessionAttributes.text = results[8].status;
                  session.attributes = sessionAttributes;
                  cardContent = cardContent + results[8].status + " ";
                  speechText = "<p>" + speechText + results[8].status + "</p> ";
                  break;
                case 'blue':
                  sessionAttributes.text = results[3].status;
                  session.attributes = sessionAttributes;
                  cardContent = cardContent + results[3].status + " ";
                  speechText = "<p>" + speechText + results[3].status + "</p> ";

                    break;
                case 'red':
                  sessionAttributes.text = results[0].status;
                  session.attributes = sessionAttributes;
                  cardContent = cardContent + results[0].status + " ";
                  speechText = "<p>" + speechText + results[0].status + "</p> ";

                    break;
                case 'green':
                  sessionAttributes.text = results[1].status;
                  session.attributes = sessionAttributes;
                  cardContent = cardContent + results[1].status + " ";
                  speechText = "<p>" + speechText + results[1].status + "</p> ";

                    break;
                case 'lightgreen':
                  sessionAttributes.text = results[5].status;
                  session.attributes = sessionAttributes;
                  cardContent = cardContent + results[5].status + " ";
                  speechText = "<p>" + speechText + results[5].status + "</p> ";

                    break;
                case 'grey':
                  sessionAttributes.text = results[7].status;
                  session.attributes = sessionAttributes;
                  cardContent = cardContent + results[7].status + " ";
                  speechText = "<p>" + speechText + results[7].status + "</p> ";

                    break;
                case 'orange':
                  sessionAttributes.text = results[4].status;
                  session.attributes = sessionAttributes;
                  cardContent = cardContent + results[4].status + " ";
                  speechText = "<p>" + speechText + results[4].status + "</p> ";

                    break;
                case 'purple':
                  sessionAttributes.text = results[2].status;
                  session.attributes = sessionAttributes;
                  cardContent = cardContent + results[2].status + " ";
                  speechText = "<p>" + speechText + results[2].status + "</p> ";

                    break;
                case 'brown':
                  sessionAttributes.text = results[6].status;
                  session.attributes = sessionAttributes;
                  cardContent = cardContent + results[6].status + " ";
                  speechText = "<p>" + speechText + results[6].status + "</p> ";
                    break;
                  default:
                    console.log('stuff')
            }
            speechText = speechText + "<p>Wanna go deeper in history?</p>";
            var speechOutput = {
                speech: "<speak>" + prefixContent + speechText + "</speak>",
                type: AlexaSkill.speechOutputType.SSML
            };
            var repromptOutput = {
                speech: repromptText,
                type: AlexaSkill.speechOutputType.PLAIN_TEXT
            };
            response.askWithCard(speechOutput, repromptOutput, cardTitle, cardContent);

        }
    });
}

/**
 * Gets a poster prepares the speech to reply to the user.
 */
function handleNextEventRequest(intent, session, response) {
    var cardTitle = "Would you like to check another train",
        sessionAttributes = session.attributes,
        result = sessionAttributes.text,
        speechText = "",
        cardContent = "",
        repromptText = "Do you want to know more about what happened on this date?",
        i;
    if (!result) {
        speechText = "With History Buff, you can get historical events for any day of the year. For example, you could say today, or August thirtieth. Now, which day do you want?";
        cardContent = speechText;
    } else if (sessionAttributes.index >= result.length) {
        speechText = "There are no more events for this date. Try another date by saying <break time = \"0.3s\"/> get events for august thirtieth.";
        cardContent = "There are no more events for this date. Try another date by saying, get events for august thirtieth.";
    } else {
        for (i = 0; i < paginationSize; i++) {
            if (sessionAttributes.index>= result.length) {
                break;
            }
            speechText = speechText + "<p>" + result[sessionAttributes.index] + "</p> ";
            cardContent = cardContent + result[sessionAttributes.index] + " ";
            sessionAttributes.index++;
        }
        if (sessionAttributes.index < result.length) {
            speechText = speechText + " Wanna go deeper in history?";
            cardContent = cardContent + " Wanna go deeper in history?";
        }
    }
    var speechOutput = {
        speech: "<speak>" + speechText + "</speak>",
        type: AlexaSkill.speechOutputType.SSML
    };
    var repromptOutput = {
        speech: repromptText,
        type: AlexaSkill.speechOutputType.PLAIN_TEXT
    };
    response.askWithCard(speechOutput, repromptOutput, cardTitle, cardContent);
}


// Create the handler that responds to the Alexa Request.
exports.handler = function (event, context) {
    // Create an instance of the HistoryBuff Skill.
    var skill = new TrainTrafficSkill();
    skill.execute(event, context);
};

