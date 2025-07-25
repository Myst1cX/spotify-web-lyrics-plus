I assume that you have implemented your JWT authentication in the backend.

Install the necessary packages

# npm i js-cookie
# npm i jsonwebtoken

// if using typescript, you also need this.

# npm i @types/js-cookie
# npm i @types/jsonwebtoken

Sign In or Login

This simply refers to the authentication process (who is the user?), when we verify the user’s credentials we need to return an access token and a refresh token, we will save those tokens for a later request, we will save the tokens in the cookie.

I will save this in the cookie for the sake of simplicity, but you might do whatever you want, you can even safe the access token in memory and the refresh token in a cookie.

in /api/signin/

Using next.js app router


export async function POST(request: Request) {
  const { email, password } = await request.json();
  const options: RequestInit = {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
    }),
    headers: {
      "Content-Type": "application/json",
    },
  };
  // make the request to authenticate the user
  const tokensResponse: SignInResponse = await fetch(
    "http://localhost:3030/auth/local/signin",
    options,
  ).then((res) => res.json());

  if ("error" in tokensResponse) {
    // Bad request
    return Response.json(tokensResponse);
  }

  const response = NextResponse.json(tokensResponse, {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
  
  // Save the tokens in the cookie response
  response.cookies.set({
    name: "tokens",
    path: "/",
    value: JSON.stringify(tokensResponse),
  });

  return response;
}

This simply create a POST endpoint under the ‘/api/signin’ this endpoint is responsible for sending the user’s credentials to the backend and to set the tokens in the cookie:

  response.cookies.set({
    name: "tokens",
    path: "/",
    value: JSON.stringify(tokensResponse),
  });

Get tokens from Cookie and validate JWT

In order for save the tokens in the cookie to be useful we should have a way to retrieve those cookies. Let’s create a function called getUserCredentials in /utils/auth/getUserCredentials.ts:

import { NextRequest } from "next/server";

export type UserCredentials = {
  refreshToken: string;
  accessToken: string;
  tokenExpires: number;
};

export function getUserCredentials(req: NextRequest): UserCredentials | null {
// getting the tookes from the cookie
  let tokens = req.cookies.get('tokens')?.value;
  if (!tokens) return null;
  const credentials = JSON.parse(tokens) as UserCredentials;
  return credentials
}

Now that we have a way to retrieve the tokens, we should now have a way to validate those tokens. Let’s create in utils/auth/isValidJWT.ts:

import * as jwt from "jsonwebtoken";

export default async function isValidJWT(token: string) {
                     // You should have a super secret store in .env.local
  const JWT_SECRET = process.env["JWT_SECRET"] ?? "";
  // Transform the callback into a promise
  return new Promise((resolve) => {
    // you can return the payload instead of true if you want.
    jwt.verify(token, JWT_SECRET, function (err, payload) {
      if (err) resolve(false);
      return resolve(true);
    });
  });
}

One last thing we need to start creating a custom fetch, is that we need a way to set the new tokens that we get from refreshing. Let’s create a function class saveUserTokens in utils/auth/saveUserTokens.ts :

// Import the 'js-cookie' library to handle cookies
import Cookie from 'js-cookie';

export type Tokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// Define a function named 'saveUserTokens' that takes a 'Tokens' object as a parameter
export default function saveUserTokens(
  credentials: Tokens,
) {
  // Convert the 'credentials' object to a JSON string
  const data = JSON.stringify(credentials);

  // Set a cookie named 'user' with the JSON stringified 'credentials' data
  Cookie.set('user', data);
}

Creating a custom Fetch

Uff! this is getting long, we are almost finish. All that we have done before, from saving the tokens to retrieving the tokens and validate JWT, it’s just for this part. The purpose of the function that we are going to create soon, it’s just make http request with ‘Bearer token’ set in the request header and refresh everytime the access token is not longer valid. Let’s create a function in utils/auth/fetchWithCredentials.ts this file is quite long, but just remember the purpose and you will soon make sense of it:

// Import necessary modules and types
import { NextRequest } from "next/server";
import { getUserCredentials } from "./getUserCredentials";
import saveUserTokens from "./saveUserTokens";
import { Tokens } from "../types/tokens";
import { UnauthorizedResponse } from "../types/unauthorizedResponse";

// Define the backend URL and the maximum time for token refresh
const BACKEND_URL = process.env["BACKEND_APP"];
const MAX_TIME_REFRESH = 60 * 1000; // Use this to determine when to refresh tokens

// Define the main function for making authenticated requests
export default async function fetchWithCredentials(
  path: string,
  init: RequestInit | undefined,
  req: NextRequest,
) {
  // Retrieve user credentials from the request
  const userCredentials = getUserCredentials(req);

  // If no user credentials are available, return an unauthorized response
  if (!userCredentials) {
    return { message: "No credentials provided", statusCode: 401 };
  }

  // Create a function to make the fetch request with the appropriate credentials
  const requestToFetch = makeFetch(path, userCredentials.accessToken, init);

  // Check if the access token is about to expire, and refresh it if needed
  if (userCredentials.tokenExpires - (Date.now() + MAX_TIME_REFRESH) < 0) {
    // Attempt to refresh the tokens
    const newTokens = await refresh(userCredentials.refreshToken);

    // If successful, save the new tokens and retry the original request
    if ("accessToken" in newTokens) {
      saveUserTokens(newTokens);
      return await requestToFetch(newTokens.accessToken);
    }

    // If token refresh fails, return the error response
    return newTokens;
  }

  // If the access token is still valid, proceed with the original request
  return requestToFetch();
}

// Function to refresh user tokens
async function refresh(rt: string) {
  return new Promise<UnauthorizedResponse | Tokens>((resolve) => {
    // Make a POST request to the token refresh endpoint
    fetch(BACKEND_URL + "/auth/refresh", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${rt}`,
      },
    })
      .then((res) => res.json())
      .then((json) => resolve(json));
  });
}

// Function to create a fetch function with the specified credentials
function makeFetch(
  path: string,
  accessToken: string,
  init: RequestInit | undefined,
): (newAccessToken?: string) => Promise<any> {
  return async function (newAccessToken?: string) {
    // Make a fetch request to the specified path with the provided or refreshed access token
    return fetch(`${BACKEND_URL}${path}`, {
      headers: {
        Authorization: `Bearer ${newAccessToken ?? accessToken}`,
      },
      ...init,
    }).then((res) => res.json());
  };
}

Protected Routes

Well, this is more like a plus. We are be using the middleware to redirect (if the route is protected and the user is not authorized) to login page. Let’s create in the root of your project middleware.ts:

    Now it’s the time when we are going to use the isValidJWT function to validate that the refresh token is valid, if the refresh token is invalid, we need to send the user back to the login page.

    You could also use isValidJWT function in the fetchWithCredentials function if you only want to refresh when the access token is invalid, instead of when it’s only have 60 seconds left.

// Import necessary modules and functions
import { NextResponse, type NextRequest } from "next/server";
import { getUserCredentials } from "./utils/auth/getUserCredentials";
import isValidJWT from "./utils/auth/isValidJWT";

// Define the routes that require authentication
const protectedRoutes = ["/api/rsc", "/"];

// Middleware function to handle authentication and redirection
export async function middleware(request: NextRequest) {
  // Extract the pathname from the request URL
  const pathname = request.nextUrl.pathname;

  // Get user credentials from the request
  const credentials = getUserCredentials(request);

  // Check if the current route is protected and user credentials are missing
  // or the refresh token is not valid
  if (
    (protectedRoutes.includes(pathname) && !credentials) ||
    (await isValidJWT(credentials?.refreshToken ?? ""))
  ) {
    // Delete the "user" cookie to log the user out
    request.cookies.delete("user");

    // Create a redirection response to the "/auth" endpoint
    const response = NextResponse.redirect(new URL("/auth", request.url));

    // Delete the "user" cookie from the response as well
    response.cookies.delete("user");

    // Return the redirection response
    return response;
  }

  // If the route is not protected or the user has valid credentials, continue to the next middleware
  return NextResponse.next();
}
