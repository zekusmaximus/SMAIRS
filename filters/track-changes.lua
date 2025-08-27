-- File: filters/track-changes.lua
-- Custom Pandoc filter for DOCX track changes
-- Converts OOXML track change elements in markdown to proper Word track changes

local track_changes = {
  enabled = false,
  revision_id = 1,
  changes = {}
}

-- Parse metadata to enable track changes
function Meta(meta)
  if meta['track-changes'] and (meta['track-changes'] == true or pandoc.utils.stringify(meta['track-changes']) == "true") then
    track_changes.enabled = true
    
    -- Extract author information
    if meta.author then
      track_changes.default_author = pandoc.utils.stringify(meta.author)
    else
      track_changes.default_author = "Unknown"
    end
    
    -- Extract date
    if meta.date then
      track_changes.default_date = pandoc.utils.stringify(meta.date)
    else
      track_changes.default_date = os.date("%Y-%m-%dT%H:%M:%SZ")
    end
  end
  
  return meta
end

-- Process inline elements for track changes
function Str(elem)
  if not track_changes.enabled then
    return elem
  end
  
  local text = elem.text
  
  -- Check for OOXML insertion markers
  if string.match(text, '<w:ins[^>]*>') then
    local author = string.match(text, 'w:author="([^"]*)"') or track_changes.default_author
    local date = string.match(text, 'w:date="([^"]*)"') or track_changes.default_date
    local id = string.match(text, 'w:id="([^"]*)"') or tostring(track_changes.revision_id)
    local content = string.match(text, '<w:t[^>]*>(.-)</w:t>')
    
    if content then
      track_changes.revision_id = track_changes.revision_id + 1
      
      -- Create proper OOXML for Word
      local ooxml = string.format(
        '<w:ins w:id="%s" w:author="%s" w:date="%s"><w:r><w:t>%s</w:t></w:r></w:ins>',
        id, author, date, content
      )
      
      return pandoc.RawInline('openxml', ooxml)
    end
  end
  
  -- Check for OOXML deletion markers
  if string.match(text, '<w:del[^>]*>') then
    local author = string.match(text, 'w:author="([^"]*)"') or track_changes.default_author
    local date = string.match(text, 'w:date="([^"]*)"') or track_changes.default_date
    local id = string.match(text, 'w:id="([^"]*)"') or tostring(track_changes.revision_id)
    local content = string.match(text, '<w:delText[^>]*>(.-)</w:delText>')
    
    if content then
      track_changes.revision_id = track_changes.revision_id + 1
      
      -- Create proper OOXML for Word deletion
      local ooxml = string.format(
        '<w:del w:id="%s" w:author="%s" w:date="%s"><w:r><w:delText>%s</w:delText></w:r></w:del>',
        id, author, date, content
      )
      
      return pandoc.RawInline('openxml', ooxml)
    end
  end
  
  -- Check for custom track change syntax [INS:content] and [DEL:content]
  if string.match(text, '%[INS:') then
    local content = string.match(text, '%[INS:(.-)%]')
    if content then
      local id = tostring(track_changes.revision_id)
      track_changes.revision_id = track_changes.revision_id + 1
      
      local ooxml = string.format(
        '<w:ins w:id="%s" w:author="%s" w:date="%s"><w:r><w:t>%s</w:t></w:r></w:ins>',
        id, track_changes.default_author, track_changes.default_date, escape_xml(content)
      )
      
      return pandoc.RawInline('openxml', ooxml)
    end
  end
  
  if string.match(text, '%[DEL:') then
    local content = string.match(text, '%[DEL:(.-)%]')
    if content then
      local id = tostring(track_changes.revision_id)
      track_changes.revision_id = track_changes.revision_id + 1
      
      local ooxml = string.format(
        '<w:del w:id="%s" w:author="%s" w:date="%s"><w:r><w:delText>%s</w:delText></w:r></w:del>',
        id, track_changes.default_author, track_changes.default_date, escape_xml(content)
      )
      
      return pandoc.RawInline('openxml', ooxml)
    end
  end
  
  return elem
end

-- Process paragraph-level changes
function Para(elem)
  if not track_changes.enabled then
    return elem
  end
  
  local new_content = {}
  local has_changes = false
  
  for i, inline in ipairs(elem.content) do
    if inline.t == "Str" then
      local processed = Str(inline)
      table.insert(new_content, processed)
      if processed ~= inline then
        has_changes = true
      end
    elseif inline.t == "RawInline" and inline.format == "openxml" then
      table.insert(new_content, inline)
      has_changes = true
    else
      table.insert(new_content, inline)
    end
  end
  
  if has_changes then
    elem.content = new_content
  end
  
  return elem
end

-- Process code blocks that might contain OOXML
function CodeBlock(elem)
  if not track_changes.enabled then
    return elem
  end
  
  local text = elem.text
  
  -- Check if this is an OOXML code block
  if string.match(text, '<w:ins') or string.match(text, '<w:del') then
    return pandoc.RawBlock('openxml', text)
  end
  
  return elem
end

-- Process inline code that might contain track changes
function Code(elem)
  if not track_changes.enabled then
    return elem
  end
  
  local text = elem.text
  
  -- Check for OOXML in inline code
  if string.match(text, '<w:ins') or string.match(text, '<w:del') then
    return pandoc.RawInline('openxml', text)
  end
  
  return elem
end

-- Process spans with track change attributes
function Span(elem)
  if not track_changes.enabled then
    return elem
  end
  
  local classes = elem.classes
  local attributes = elem.attributes
  
  -- Check for track change classes
  if classes:includes("insertion") then
    local author = attributes.author or track_changes.default_author
    local date = attributes.date or track_changes.default_date
    local id = tostring(track_changes.revision_id)
    track_changes.revision_id = track_changes.revision_id + 1
    
    local content = pandoc.utils.stringify(elem.content)
    local ooxml = string.format(
      '<w:ins w:id="%s" w:author="%s" w:date="%s"><w:r><w:t>%s</w:t></w:r></w:ins>',
      id, author, date, escape_xml(content)
    )
    
    return pandoc.RawInline('openxml', ooxml)
    
  elseif classes:includes("deletion") then
    local author = attributes.author or track_changes.default_author
    local date = attributes.date or track_changes.default_date
    local id = tostring(track_changes.revision_id)
    track_changes.revision_id = track_changes.revision_id + 1
    
    local content = pandoc.utils.stringify(elem.content)
    local ooxml = string.format(
      '<w:del w:id="%s" w:author="%s" w:date="%s"><w:r><w:delText>%s</w:delText></w:r></w:del>',
      id, author, date, escape_xml(content)
    )
    
    return pandoc.RawInline('openxml', ooxml)
  end
  
  return elem
end

-- Helper function to escape XML characters
function escape_xml(text)
  return text:gsub("&", "&amp;")
             :gsub("<", "&lt;")
             :gsub(">", "&gt;")
             :gsub("\"", "&quot;")
             :gsub("'", "&apos;")
end

-- Helper function to generate Windows file time
function windows_file_time()
  -- This is a simplified version - in practice you'd want proper conversion
  local unix_time = os.time()
  -- Windows epoch is January 1, 1601; Unix epoch is January 1, 1970
  -- Difference is 11644473600 seconds
  local windows_time = (unix_time + 11644473600) * 10000000
  return tostring(windows_time)
end

-- Final document processing
function Pandoc(doc)
  if track_changes.enabled then
    -- Add track changes settings to the document
    local settings_xml = [[
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:trackRevisions w:val="1"/>
  <w:doNotPromptForConvert w:val="1"/>
</w:settings>
]]
    
    -- Add as a raw block at the beginning (this will need to be handled by the DOCX writer)
    table.insert(doc.blocks, 1, pandoc.RawBlock('openxml', settings_xml))
  end
  
  return doc
end

-- Export the filter functions
return {
  { Meta = Meta },
  { Str = Str, Code = Code, Span = Span },
  { Para = Para, CodeBlock = CodeBlock },
  { Pandoc = Pandoc }
}