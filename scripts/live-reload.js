const events = new EventSource("/__reload");
events.onmessage = () => location.reload();
