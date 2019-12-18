# awesome_print
begin
  require "awesome_print"
  Pry.config.print = proc { |output, value| output.puts value.ai }
rescue LoadError
  puts "no gem install awesome_print "
end

Pry.config.editor = "nvim"
Pry.config.prompt = proc do |obj, nest_level, _pry_|
version = ''
version << "#{RUBY_VERSION}"

"#{version} #{Pry.config.prompt_name}(#{Pry.view_clip(obj)})> "
end
