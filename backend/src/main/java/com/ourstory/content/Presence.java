package com.ourstory.content;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.BeanProperty;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JavaType;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.fasterxml.jackson.databind.deser.ContextualDeserializer;
import java.io.IOException;

/**
 * A JSON field whose three states matter: ABSENT (the Java reference is {@code null}), explicitly {@code null}
 * ({@code new Presence<>(null)}) and a value. Used where "omitted keeps, null clears".
 */
public record Presence<T>(T value) {

    /** The value of a possibly-absent field, or {@code fallback} when it was omitted. */
    public static <T> T orElse(Presence<T> field, T fallback) {
        return field == null ? fallback : field.value();
    }

    /** Reads the contained type's value; maps JSON null to a present-but-null Presence. */
    public static final class Deserializer extends JsonDeserializer<Presence<?>> implements ContextualDeserializer {

        private final JsonDeserializer<?> inner;

        public Deserializer() {
            this(null);
        }

        private Deserializer(JsonDeserializer<?> inner) {
            this.inner = inner;
        }

        @Override
        public JsonDeserializer<?> createContextual(DeserializationContext ctxt, BeanProperty property)
                throws com.fasterxml.jackson.databind.JsonMappingException {
            JavaType wrapper = property != null ? property.getType() : ctxt.getContextualType();
            JavaType contained = wrapper.containedTypeOrUnknown(0);
            return new Deserializer(ctxt.findContextualValueDeserializer(contained, property));
        }

        @Override
        public Presence<?> deserialize(JsonParser p, DeserializationContext ctxt) throws IOException {
            return new Presence<>(inner.deserialize(p, ctxt));
        }

        @Override
        public Presence<?> getNullValue(DeserializationContext ctxt) {
            return new Presence<>(null);
        }

        @Override
        public Object getAbsentValue(DeserializationContext ctxt) {
            return null;
        }
    }
}
