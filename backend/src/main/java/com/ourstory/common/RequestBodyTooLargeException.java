package com.ourstory.common;

import java.io.IOException;

/** Thrown from the request stream once more bytes were read than the endpoint allows. */
public class RequestBodyTooLargeException extends IOException {

    public RequestBodyTooLargeException(long limit) {
        super("Request body exceeds " + limit + " bytes");
    }

    /** True when this exception, or anything in its cause chain, is a {@link RequestBodyTooLargeException}. */
    public static boolean isCausedBy(Throwable error) {
        for (Throwable t = error; t != null; t = t.getCause() == t ? null : t.getCause()) {
            if (t instanceof RequestBodyTooLargeException) {
                return true;
            }
        }
        return false;
    }
}
